// @ts-nocheck
'use client'

import '../src/styles/backgrounds.css'
import Button from '../src/components/Button'

interface ErrorProps {
  error?: Error
  reset: () => void
}

export default function Error({ reset }: ErrorProps) {
  return (
    <div className="page-background" style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontFamily: 'Barlow, system-ui, sans-serif',
      padding: '20px',
      textAlign: 'center',
    }}>
      <div style={{
        position: 'relative',
        marginBottom: '2rem',
      }}>
        <img
          src="/failpurrgil.png"
          alt="Error"
          style={{
            maxWidth: '600px',
            width: '100%',
            display: 'block',
            boxShadow: '0 0 80px 40px rgb(9, 9, 9)',
          }}
        />
        <div style={{
          position: 'absolute',
          inset: 0,
          background: `
            linear-gradient(to bottom, rgb(9, 9, 9) 0%, transparent 20%),
            linear-gradient(to top, rgb(9, 9, 9) 0%, transparent 20%),
            linear-gradient(to right, rgb(9, 9, 9) 0%, transparent 20%),
            linear-gradient(to left, rgb(9, 9, 9) 0%, transparent 20%),
            linear-gradient(0deg, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.3))
          `,
          pointerEvents: 'none',
        }} />
      </div>
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>
        Something Went Wrong
      </h1>
      <p style={{ color: 'rgba(255, 255, 255, 0.7)', maxWidth: '400px', lineHeight: 1.6 }}>
        An unexpected error occurred. Please try again.
      </p>
      <Button
        variant="primary"
        size="lg"
        onClick={() => reset()}
        style={{ marginTop: '2rem' }}
      >
        Try Again
      </Button>
    </div>
  )
}
