import { useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowLeftIcon } from '@radix-ui/react-icons'
import { supabase, suppliersQuery } from '../lib/supabase'

// Simple token overlap similarity (0–1)
function tokenSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.split(/\s+/).filter(Boolean))
  const tokensB = new Set(b.split(/\s+/).filter(Boolean))
  if (tokensA.size === 0 && tokensB.size === 0) return 1
  let shared = 0
  for (const t of tokensA) if (tokensB.has(t)) shared++
  return shared / Math.max(tokensA.size, tokensB.size)
}

function normName(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

export function NewSupplierFlow() {
  const navigate = useNavigate()

  const [razonSocial, setRazonSocial] = useState('')
  const [nit, setNit] = useState('')
  const [nombreOperativo, setNombreOperativo] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicateId, setDuplicateId] = useState<string | null>(null)
  const [existingHasRut, setExistingHasRut] = useState<boolean | null>(null)
  const [merging, setMerging] = useState(false)

  const [similarNames, setSimilarNames] = useState<{ id: string; razon_social: string }[]>([])

  const [rutFile, setRutFile] = useState<File | null>(null)
  const [rutTempPath, setRutTempPath] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [extracted, setExtracted] = useState(false)
  const rutInputRef = useRef<HTMLInputElement>(null)

  const handleRutExtract = async (file: File) => {
    setExtracting(true)
    setExtractError(null)
    setExtracted(false)
    try {
      const tempPath = `_temp/${crypto.randomUUID()}-${file.name}`
      const { error: upErr } = await supabase.storage
        .from('supplier-documents')
        .upload(tempPath, file, { contentType: file.type || 'application/pdf' })
      if (upErr) throw new Error(`Error al subir: ${upErr.message}`)

      const { data: urlData, error: urlErr } = await supabase.storage
        .from('supplier-documents')
        .createSignedUrl(tempPath, 120)
      if (urlErr || !urlData?.signedUrl) throw new Error('No se pudo generar enlace.')

      const { data: res, error: fnErr } = await supabase.functions.invoke('extract-rut', {
        body: { url: urlData.signedUrl },
      })

      // Keep temp file — will be moved to supplier path after creation
      // (only clean up on error)
      if (fnErr || !res?.success) {
        void supabase.storage.from('supplier-documents').remove([tempPath])
        throw new Error(fnErr?.message ?? res?.error ?? 'Error al extraer datos.')
      }

      setRutTempPath(tempPath)

      const rut = res.rut as { razon_social?: string | null }
      const fields = res.fields as { nit?: string | null; email?: string | null; telefono?: string | null }

      if (rut.razon_social) {
        setRazonSocial(rut.razon_social)
        void checkSimilarNames(rut.razon_social)
      }
      if (fields.nit)       setNit(fields.nit.replace(/\D/g, '').slice(0, 10))
      if (fields.email)     setEmail(fields.email)
      if (fields.telefono)  setTelefono(fields.telefono)
      setExtracted(true)
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : 'Error al extraer datos del RUT.')
    }
    setExtracting(false)
  }

  const checkSimilarNames = async (name: string) => {
    if (name.trim().length < 3) return
    const words = name.trim().split(/\s+/).filter(w => w.length >= 3)
    if (words.length === 0) return
    const { data } = await suppliersQuery('id, razon_social')
      .ilike('razon_social', `%${words[0]}%`)
      .limit(20)
    const normInput = normName(name)
    const similar = (data as unknown as { id: string; razon_social: string }[] ?? [])
      .filter(s => {
        const n = normName(s.razon_social)
        return n !== normInput && (n.includes(normInput) || normInput.includes(n) || tokenSimilarity(normInput, n) > 0.5)
      })
      .slice(0, 3)
    setSimilarNames(similar.map(s => ({ id: s.id, razon_social: s.razon_social })))
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setDuplicateId(null)
    setExistingHasRut(null)

    // Block on duplicate NIT
    if (nit.trim()) {
      const { data: existing } = await suppliersQuery('id').eq('nit', nit.trim()).maybeSingle()
      if (existing) {
        const existingId = (existing as unknown as { id: string }).id
        setDuplicateId(existingId)
        const { data: rutDocs } = await supabase.from('suppliers_documents')
          .select('id').eq('supplier_id', existingId).eq('document_type', 'RUT').limit(1)
        setExistingHasRut((rutDocs?.length ?? 0) > 0)
        setError('Ya existe un proveedor con este NIT.')
        return
      }
    }

    setSaving(true)

    const { data: fnData, error: fnError } = await supabase.functions.invoke('add-supplier', {
      body: {
        razonSocial:     razonSocial.trim(),
        nitCedula:       nit.trim() || '0',
        nombreOperativo: nombreOperativo.trim() || undefined,
      },
    })

    if (fnError || !fnData?.success) {
      setSaving(false)
      setError(fnData?.error || 'No se pudo crear el proveedor. Intenta de nuevo.')
      return
    }

    const supplierId = (fnData.supplier as { id: string }).id
    await supabase
      .from('accounts_suppliers')
      .update({
        razon_social:     razonSocial.trim(),
        nit:              nit.trim() || null,
        nombre_operativo: nombreOperativo.trim() || null,
        email:            email.trim() || null,
        telefono:         telefono.trim() || null,
        status:           'ACTIVE',
      })
      .eq('id', supplierId)

    // If a RUT was extracted, move temp file to the supplier's permanent path
    if (rutFile && rutTempPath) {
      const slugify = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_')
      const finalPath = `${supplierId}/RUT/${Date.now()}_${slugify(rutFile.name)}`
      const { error: copyErr } = await supabase.storage
        .from('supplier-documents')
        .copy(rutTempPath, finalPath)
      void supabase.storage.from('supplier-documents').remove([rutTempPath])
      if (!copyErr) {
        await supabase.from('suppliers_documents').insert({
          supplier_id:     supplierId,
          document_type:   'RUT',
          storage_path:    finalPath,
          file_name:       rutFile.name,
          file_size_bytes: rutFile.size,
          mime_type:       rutFile.type || 'application/pdf',
        })
      }
    }

    setSaving(false)
    navigate(`/suppliers/${supplierId}`, { replace: true })
  }

  // Merge: upload the RUT file to the existing supplier and navigate there
  const handleMerge = async () => {
    if (!rutFile || !duplicateId) return
    setMerging(true)
    const slugify = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${duplicateId}/RUT/${Date.now()}_${slugify(rutFile.name)}`
    const { error: upErr } = await supabase.storage
      .from('supplier-documents')
      .upload(storagePath, rutFile)
    if (upErr) { setMerging(false); setError(`Error al subir RUT: ${upErr.message}`); return }
    await supabase.from('suppliers_documents').insert({
      supplier_id:     duplicateId,
      document_type:   'RUT',
      storage_path:    storagePath,
      file_name:       rutFile.name,
      file_size_bytes: rutFile.size,
      mime_type:       rutFile.type || 'application/pdf',
    })
    navigate(`/suppliers/${duplicateId}`, { replace: true })
  }

  const canSave = razonSocial.trim().length > 0 && !saving

  return (
    <div>
      <button
        onClick={() => navigate('/')}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: 'none',
          color: 'var(--hh-haze)', fontFamily: 'var(--font-body)',
          fontSize: '0.8125rem', cursor: 'pointer', padding: 0, marginBottom: 32,
        }}
      >
        <ArrowLeftIcon width={16} height={16} />
        Proveedores
      </button>

      <div style={{ maxWidth: 480 }}>
        <div style={{
          background: 'var(--hh-white)',
          border: '1px solid rgba(122,145,165,0.2)',
          borderRadius: 10,
          padding: '36px 40px',
        }}>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 300,
            fontSize: '1.5rem', color: 'var(--hh-dark)', margin: '0 0 28px',
          }}>
            Nuevo Proveedor
          </h1>

          {/* RUT upload section */}
          <div style={{
            background: 'var(--hh-ice)',
            border: `1px solid ${extracted ? 'var(--hh-teal)' : 'rgba(122,145,165,0.25)'}`,
            borderRadius: 8,
            padding: '16px 18px',
            marginBottom: 24,
          }}>
            <div style={{
              fontFamily: 'var(--font-body)', fontWeight: 500,
              fontSize: '0.6875rem', textTransform: 'uppercase',
              letterSpacing: '0.12em', color: 'var(--hh-teal)', marginBottom: 10,
            }}>
              Autocompletar desde RUT
            </div>
            <input
              ref={rutInputRef}
              id="rut-file-input"
              type="file"
              accept=".pdf,image/*"
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0] ?? null
                setRutFile(f)
                setExtracted(false)
                setExtractError(null)
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                onClick={() => rutInputRef.current?.click()}
                disabled={extracting}
                style={{
                  fontFamily: 'var(--font-body)', fontWeight: 400,
                  fontSize: '0.8125rem', color: 'var(--hh-dark)',
                  background: '#fff', border: '1px solid rgba(122,145,165,0.4)',
                  borderRadius: 5, padding: '7px 12px',
                  cursor: extracting ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {rutFile ? rutFile.name : 'Seleccionar RUT…'}
              </button>
              {rutFile && !extracting && !extracted && (
                <button
                  type="button"
                  onClick={() => void handleRutExtract(rutFile)}
                  style={{
                    fontFamily: 'var(--font-body)', fontWeight: 500,
                    fontSize: '0.8125rem', color: '#fff',
                    background: 'var(--hh-teal)', border: 'none',
                    borderRadius: 5, padding: '7px 14px',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  Extraer datos
                </button>
              )}
              {extracting && (
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--hh-haze)' }}>
                  Extrayendo…
                </span>
              )}
              {extracted && (
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--hh-teal)' }}>
                  Datos completados — revisa y guarda.
                </span>
              )}
            </div>
            {extractError && (
              <div style={{ marginTop: 8, fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--hh-mango)' }}>
                {extractError}
              </div>
            )}
          </div>

          <form onSubmit={e => void handleCreate(e)} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={labelStyle}>
                Razón Social <span style={requiredStyle}>*</span>
              </label>
              <input
                type="text"
                value={razonSocial}
                onChange={e => { setRazonSocial(e.target.value); setSimilarNames([]) }}
                onBlur={e => { if (e.target.value.trim().length >= 3) void checkSimilarNames(e.target.value) }}
                required
                autoFocus
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--hh-teal)' }}
              />
              {similarNames.length > 0 && (
                <div style={{ marginTop: 6, padding: '8px 10px', background: 'rgba(255,181,36,0.08)', border: '1px solid rgba(255,181,36,0.3)', borderRadius: 5 }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--hh-mango)', marginBottom: 4 }}>
                    Posibles duplicados — revisa antes de crear:
                  </div>
                  {similarNames.map(s => (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 2 }}>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--hh-dark)' }}>{s.razon_social}</span>
                      <Link to={`/suppliers/${s.id}`} style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--hh-teal)', textDecoration: 'underline', textUnderlineOffset: 2, whiteSpace: 'nowrap', marginLeft: 10 }}>
                        Ver perfil →
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label style={labelStyle}>NIT</label>
              <input
                type="text"
                value={nit}
                onChange={e => { setNit(e.target.value.replace(/\D/g, '').slice(0, 10)); setDuplicateId(null); setExistingHasRut(null); setError(null) }}
                placeholder="Sin puntos ni dígito de verificación"
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--hh-teal)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(122,145,165,0.4)' }}
              />
            </div>

            <div>
              <label style={labelStyle}>
                Nombre Operativo{' '}
                <span style={optionalStyle}>(opcional)</span>
              </label>
              <input
                type="text"
                value={nombreOperativo}
                onChange={e => setNombreOperativo(e.target.value)}
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--hh-teal)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(122,145,165,0.4)' }}
              />
            </div>

            <div>
              <label style={labelStyle}>
                Email{' '}
                <span style={optionalStyle}>(opcional)</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--hh-teal)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(122,145,165,0.4)' }}
              />
            </div>

            <div>
              <label style={labelStyle}>
                Teléfono{' '}
                <span style={optionalStyle}>(opcional)</span>
              </label>
              <input
                type="text"
                value={telefono}
                onChange={e => setTelefono(e.target.value)}
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--hh-teal)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(122,145,165,0.4)' }}
              />
            </div>

            {error && (
              <div style={{ fontSize: '0.8125rem', color: 'var(--hh-mango)', margin: 0 }}>
                {error}
                {duplicateId && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Link to={`/suppliers/${duplicateId}`} style={{ color: 'var(--hh-teal)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                      Ver perfil →
                    </Link>
                    {rutFile && existingHasRut === false && (
                      <button
                        type="button"
                        disabled={merging}
                        onClick={() => void handleMerge()}
                        style={{
                          fontFamily: 'var(--font-body)', fontWeight: 500,
                          fontSize: '0.8125rem', color: '#fff',
                          background: merging ? 'rgba(74,155,142,0.5)' : 'var(--hh-teal)',
                          border: 'none', borderRadius: 5, padding: '4px 12px',
                          cursor: merging ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {merging ? 'Fusionando…' : 'Subir RUT al perfil existente →'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSave}
              style={{
                marginTop: 4,
                background: canSave ? 'var(--hh-teal)' : 'rgba(74,155,142,0.5)',
                color: '#fff',
                fontFamily: 'var(--font-body)', fontWeight: 500,
                fontSize: '0.875rem', border: 'none', borderRadius: 6,
                padding: '11px 20px',
                cursor: canSave ? 'pointer' : 'not-allowed',
                width: '100%',
              }}
            >
              {saving ? 'Creando…' : 'Crear Proveedor'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-body)', fontWeight: 500,
  fontSize: '0.6875rem', textTransform: 'uppercase',
  letterSpacing: '0.12em', color: 'var(--hh-teal)', marginBottom: 6,
}

const requiredStyle: React.CSSProperties = {
  color: 'var(--hh-mango)', fontWeight: 400,
}

const optionalStyle: React.CSSProperties = {
  fontWeight: 300, textTransform: 'none', letterSpacing: 0, color: 'var(--hh-haze)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  fontFamily: 'var(--font-body)', fontWeight: 300,
  fontSize: '0.875rem', color: 'var(--hh-dark)',
  background: 'var(--hh-ice)',
  border: '1px solid rgba(122,145,165,0.4)',
  borderRadius: 6, padding: '9px 12px',
  outline: 'none', boxSizing: 'border-box',
}
