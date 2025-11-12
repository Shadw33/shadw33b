import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'

import { LEGAL_CONTENT, LegalModalType } from '@/lib/legal'

interface LegalModalProps {
  type: LegalModalType
  open: boolean
  onClose: () => void
}

export function LegalModal({ type, open, onClose }: LegalModalProps) {
  const content = LEGAL_CONTENT[type]

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose()
        }
      }}
    >
      <DialogContent className="bg-black/95 border border-purple-500/40 text-gray-200 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
            {content.title}
          </DialogTitle>
          <DialogDescription className="text-xs uppercase tracking-wide text-purple-200/70">
            {content.subtitle}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 max-h-[70vh] overflow-y-auto pr-2 text-sm leading-relaxed space-y-6">
          {content.intro.map((paragraph, index) => (
            <p key={`intro-${index}`} className="text-gray-200">
              {paragraph}
            </p>
          ))}

          {content.sections.map((section) => (
            <section key={section.heading} className="space-y-2">
              <h3 className="text-base font-semibold text-purple-200">
                {section.heading}
              </h3>
              {section.body && <p className="text-gray-300">{section.body}</p>}
              {section.items && (
                <ul className="list-disc space-y-1 pl-5 text-gray-300">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {content.closingNote && (
            <p className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-gray-100">
              {content.closingNote}
              {content.contactEmail && (
                <>
                  {' '}
                  Reach us at{' '}
                  <a
                    href={`mailto:${content.contactEmail}`}
                    className="underline decoration-dotted decoration-purple-400 text-purple-200 hover:text-purple-100"
                  >
                    {content.contactEmail}
                  </a>
                  .
                </>
              )}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}


