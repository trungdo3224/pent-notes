

export function App() {
  const isDesktop = typeof window !== 'undefined' && 'electronAPI' in window
  
  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>PentNotes Desktop</h1>
      <p>Running in: <strong>{isDesktop ? 'Electron Desktop' : 'Web Browser'}</strong></p>
      {isDesktop && <p>Platform: {window.electronAPI?.platform}</p>}
    </div>
  )
}