import { DownloadIcon } from '@radix-ui/react-icons';

interface Props {
  onClick: () => void;
  style?: React.CSSProperties;
}

export function ExcelDownloadButton({ onClick, style }: Props) {
  return (
    <button
      onClick={onClick}
      title="Descargar Excel"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 4,
        border: '1px solid rgba(74,155,142,0.35)',
        background: 'none',
        cursor: 'pointer',
        color: '#4A9B8E',
        flexShrink: 0,
        ...style,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(74,155,142,0.08)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
    >
      <DownloadIcon width={14} height={14} />
    </button>
  );
}
