interface Props {
  onClick: () => void;
  style?: React.CSSProperties;
}

export function ExcelDownloadButton({ onClick, style }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: '#EEF1F4',
        border: 'none',
        color: '#566778',
        fontSize: '11px',
        padding: '3px 9px',
        borderRadius: '3px',
        cursor: 'pointer',
        fontFamily: "'DM Sans', system-ui, sans-serif",
        whiteSpace: 'nowrap',
        flexShrink: 0,
        ...style,
      }}
    >
      ↓ XLSX
    </button>
  );
}
