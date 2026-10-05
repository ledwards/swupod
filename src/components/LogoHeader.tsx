// @ts-nocheck
'use client'

import { useRouter, usePathname } from 'next/navigation'
import type { MouseEvent } from 'react'
import './LogoHeader.css'
import {useAuth} from '../contexts/AuthContext'
import {hasEntryAccess} from '../services/entry/access'

export interface LogoHeaderProps {
  className?: string
}

export default function LogoHeader({ className = '' }: LogoHeaderProps) {
  const {user} = useAuth()
  const alpha = hasEntryAccess(user)
  const router = useRouter()
  const pathname = usePathname()

  // Don't show on homepage
  if (alpha || pathname === '/') {
    return null
  }

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    router.push('/')
  }

  return (
    <div className={`logo-header ${className}`}>
      <a href="/" onClick={handleClick} className="logo-header-link">
        <img src="/ptp_logo400.png" alt="Protect the Pod" className="logo-header-image" />
      </a>
    </div>
  )
}
