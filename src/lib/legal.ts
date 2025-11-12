export type LegalModalType = 'privacy' | 'terms'

export const LEGAL_PATHS: Record<LegalModalType, string> = {
  privacy: '/privacy-policy',
  terms: '/terms',
}

interface LegalSection {
  heading: string
  body?: string
  items?: string[]
}

interface LegalDocument {
  title: string
  subtitle: string
  intro: string[]
  sections: LegalSection[]
  closingNote?: string
  contactEmail?: string
}

const UPDATED_ON = 'November 7, 2025'
const CONTACT_EMAIL = 'support@wormgpt.ai'

export const LEGAL_CONTENT: Record<LegalModalType, LegalDocument> = {
  privacy: {
    title: 'Privacy Policy',
    subtitle: `Updated ${UPDATED_ON}`,
    intro: [
      'We respect the confidentiality of every researcher who uses WormGPT AI. This privacy policy outlines how we handle the limited information required to operate the platform and the safeguards we apply to keep it secure.',
    ],
    sections: [
      {
        heading: 'Information We Collect',
        items: [
          'Account basics such as email address and authentication metadata required by Supabase.',
          'Operational telemetry like request timestamps, model selections, and token usage for billing and abuse prevention.',
          'Support tickets or voluntary feedback that you send to the WormGPT AI team.',
        ],
      },
      {
        heading: 'What We Do Not Collect',
        items: [
          'We do not log or store chat conversations after the session ends.',
          'We do not ingest user prompts into model training or fine-tuning pipelines.',
          'We do not share, sell, or broker personal information to third parties.',
        ],
      },
      {
        heading: 'How We Use Limited Data',
        items: [
          'Authenticate and authorize access to the terminal experience.',
          'Detect abuse, enforce acceptable use restrictions, and monitor service reliability.',
          'Respond to support requests and maintain accurate billing records.',
        ],
      },
      {
        heading: 'Security Safeguards',
        items: [
          'Encryption in transit via HTTPS and encryption at rest for stored metadata.',
          'Role-based access controls limiting staff access to the minimum required for support.',
          'Routine audits of logging systems to confirm that conversations remain ephemeral.',
        ],
      },
      {
        heading: 'Your Controls',
        items: [
          'Request a copy of the account metadata we maintain for you.',
          'Ask us to correct or delete contact information that is no longer accurate.',
          'Opt out of non-essential communications while still receiving critical service notices.',
        ],
      },
    ],
    closingNote:
      'If you have questions about how we protect your information or need to exercise a privacy request, contact us and we will respond promptly.',
    contactEmail: CONTACT_EMAIL,
  },
  terms: {
    title: 'Terms of Service',
    subtitle: `Updated ${UPDATED_ON}`,
    intro: [
      'These terms govern your use of the WormGPT AI terminal. By accessing the platform you confirm that you are conducting authorized security research and will comply with all applicable laws.',
    ],
    sections: [
      {
        heading: 'Eligibility & Accounts',
        items: [
          'You must provide accurate registration details and maintain the confidentiality of your credentials.',
          'You are responsible for all activity conducted under your account, including actions taken by authorized collaborators.',
          'We may suspend or revoke access if we detect policy violations, abusive behavior, or compromised credentials.',
        ],
      },
      {
        heading: 'Permitted Uses',
        items: [
          'Operate WormGPT AI strictly for lawful cybersecurity research, education, and defensive readiness.',
          'Use outputs in controlled environments or simulations that you are authorized to test.',
          'Respect third-party intellectual property and confidentiality obligations when submitting prompts.',
        ],
      },
      {
        heading: 'Prohibited Conduct',
        items: [
          'Generating, distributing, or operationalizing malicious code outside sanctioned lab settings.',
          'Seeking guidance for phishing, fraud, harassment, or other unlawful activity.',
          'Attempting to probe, disrupt, or bypass platform security controls.',
        ],
      },
      {
        heading: 'Service Availability',
        items: [
          'We strive for continuous uptime but do not guarantee uninterrupted access to the models.',
          'Features may evolve, and we may sunset tooling that introduces unacceptable risk.',
          'Backups are maintained for system resilience, but conversation content remains ephemeral.',
        ],
      },
      {
        heading: 'Limitations of Liability',
        body:
          'WormGPT AI is provided “as is.” To the fullest extent permitted by law, we disclaim warranties of merchantability, fitness for a particular purpose, and non-infringement. WormGPT AI and its contributors are not liable for indirect, incidental, or consequential damages arising from use of the service.',
      },
      {
        heading: 'Changes to These Terms',
        body:
          'We may update these terms to reflect legal, operational, or security requirements. We will notify registered users of material revisions. Continued use of the platform after updates constitutes acceptance of the revised terms.',
      },
    ],
    closingNote:
      'If you have questions about these terms or require written authorization for compliance purposes, reach out to our support team.',
    contactEmail: CONTACT_EMAIL,
  },
}


