import type { MouseEvent } from 'react'

interface BackButtonProps {
  onClick: (e: MouseEvent<HTMLButtonElement>) => void
  className?: string
}

export default function BackButton({ onClick, className = '' }: BackButtonProps) {
  return (
    <button
      type="button"
      className={`result-back-btn ${className}`}
      onClick={onClick}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </button>
  )
}