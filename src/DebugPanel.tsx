// src/DebugPanel.tsx
import React from 'react'

interface DebugPanelProps {
  currentPOV: { lat: number; lng: number; altitude: number }
  dimensions: { width: number; height: number }
  selectedCountry: string | null
  onClose: () => void
}

export default function DebugPanel({ currentPOV, dimensions, selectedCountry, onClose }: DebugPanelProps) {
  const handleCopy = () => {
    const code = `{ lat: ${currentPOV.lat.toFixed(2)}, lng: ${currentPOV.lng.toFixed(2)}, altitude: ${currentPOV.altitude.toFixed(2)} }`
    navigator.clipboard.writeText(code)
    alert('Coordinates copied to clipboard!')
  }

  return (
    <div style={{
      position: 'absolute',
      top: '10px',
      right: '10px',
      background: 'rgba(0, 0, 0, 0.85)',
      color: '#0f0',
      padding: '16px',
      borderRadius: '8px',
      fontFamily: 'monospace',
      fontSize: '12px',
      zIndex: 1000,
      minWidth: '300px',
      border: '1px solid #0f0'
    }}>
      <div style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>
        DEBUG MODE (Press D to toggle)
      </div>
      
      <div style={{ marginBottom: '8px' }}>
        <strong>Current POV:</strong>
      </div>
      <div style={{ marginBottom: '4px' }}>
        lat: {currentPOV.lat.toFixed(4)}
      </div>
      <div style={{ marginBottom: '4px' }}>
        lng: {currentPOV.lng.toFixed(4)}
      </div>
      <div style={{ marginBottom: '4px' }}>
        altitude: {currentPOV.altitude.toFixed(4)}
      </div>
      <div style={{ marginBottom: '12px', color: '#ff0' }}>
        dimensions: {dimensions.width}x{dimensions.height}
      </div>

      <button
        onClick={handleCopy}
        style={{
          background: '#0f0',
          color: '#000',
          border: 'none',
          padding: '8px 12px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 'bold',
          width: '100%',
          marginBottom: '12px'
        }}
      >
        Copy Coordinates
      </button>

      {selectedCountry && (
        <div style={{
          marginTop: '12px',
          paddingTop: '12px',
          borderTop: '1px solid #0f0',
          color: '#ff0'
        }}>
          <strong>Selected:</strong> {selectedCountry}
        </div>
      )}

      <div style={{
        marginTop: '12px',
        paddingTop: '12px',
        borderTop: '1px solid #0f0',
        fontSize: '11px',
        color: '#888',
        lineHeight: '1.6'
      }}>
        <strong style={{ color: '#fff', display: 'block', marginBottom: '4px' }}>Current Custom Views:</strong>
        <div>CAN: lat: 40.61, lng: -98.85, alt: 1.80</div>
        <div>USA: lat: 27.00, lng: -95.21, alt: 1.80</div>
        <div>GBR: lat: 32.66, lng: -1.34, alt: 1.80</div>
        <div>CHN: lat: 20.23, lng: 105.72, alt: 1.80</div>
        <div>AUS: lat: -47.68, lng: 136.88, alt: 1.80</div>
      </div>

      <div style={{
        marginTop: '12px',
        fontSize: '11px',
        color: '#888',
        lineHeight: '1.4'
      }}>
        • Drag to rotate<br/>
        • Click country to select<br/>
        • Adjust view, then copy coords
      </div>
    </div>
  )
}