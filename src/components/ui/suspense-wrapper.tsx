'use client'

import { Suspense } from 'react'
import { LoadingState } from '@/components/ui/loading'

interface SuspenseWrapperProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function SuspenseWrapper({ 
  children, 
  fallback = <LoadingState message="Loading..." /> 
}: SuspenseWrapperProps) {
  return <Suspense fallback={fallback}>{children}</Suspense>
}