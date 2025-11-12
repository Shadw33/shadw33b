import { useCallback, useEffect, useMemo, useState } from 'react'

import { LEGAL_PATHS, LegalModalType } from '@/lib/legal'

type UseLegalModalOptions = {
  initialPath?: string
  fallbackPath: string
}

const LEGAL_PATH_VALUES = Object.values(LEGAL_PATHS)

export function useLegalModal({ initialPath, fallbackPath }: UseLegalModalOptions) {
  const [activeModal, setActiveModal] = useState<LegalModalType | null>(null)
  const [previousPath, setPreviousPath] = useState<string>(fallbackPath)

  const resolvedInitialPath = useMemo(() => {
    if (typeof window === 'undefined') {
      return initialPath ?? '/'
    }
    return initialPath ?? window.location.pathname
  }, [initialPath])

  useEffect(() => {
    const path = resolvedInitialPath
    if (path === LEGAL_PATHS.privacy) {
      setActiveModal('privacy')
      setPreviousPath(fallbackPath)
    } else if (path === LEGAL_PATHS.terms) {
      setActiveModal('terms')
      setPreviousPath(fallbackPath)
    }
  }, [resolvedInitialPath, fallbackPath])

  useEffect(() => {
    setPreviousPath((prev) => {
      if (!prev || LEGAL_PATH_VALUES.includes(prev)) {
        return fallbackPath
      }
      return prev
    })
  }, [fallbackPath])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handlePopState = () => {
      const path = window.location.pathname
      if (path === LEGAL_PATHS.privacy) {
        setActiveModal('privacy')
      } else if (path === LEGAL_PATHS.terms) {
        setActiveModal('terms')
      } else {
        setActiveModal(null)
        setPreviousPath(path)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  const openModal = useCallback((modal: LegalModalType) => {
    if (typeof window === 'undefined') return

    const targetPath = LEGAL_PATHS[modal]
    const currentPath = window.location.pathname

    if (!LEGAL_PATH_VALUES.includes(currentPath)) {
      setPreviousPath(currentPath)
    }

    if (currentPath !== targetPath) {
      window.history.pushState({ modal }, '', targetPath)
    }

    setActiveModal(modal)
  }, [])

  const closeModal = useCallback(
    (customFallback?: string) => {
      if (typeof window === 'undefined') return

      const fallbackCandidate = customFallback ?? previousPath ?? fallbackPath
      const normalizedFallback = LEGAL_PATH_VALUES.includes(fallbackCandidate)
        ? fallbackPath
        : fallbackCandidate

      window.history.replaceState({}, '', normalizedFallback)
      setActiveModal(null)
      setPreviousPath(normalizedFallback)
    },
    [fallbackPath, previousPath]
  )

  return {
    activeModal,
    openModal,
    closeModal,
  }
}


