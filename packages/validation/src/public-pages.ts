import { z } from 'zod';

export const publicPageKeySchema = z.enum([
  'ABOUT',
  'CONTACT',
  'TERMS',
  'PRIVACY',
]);

const plainText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine((value) => !/[<>]/.test(value), {
      message: 'Raw HTML is not allowed.',
    });
const optionalPlainText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .refine((value) => !/[<>]/.test(value), {
      message: 'Raw HTML is not allowed.',
    });
const mediaRefSchema = z
  .string()
  .regex(/^(?:product:)?[a-z0-9]+$/)
  .nullable();
const internalHrefSchema = z
  .string()
  .trim()
  .regex(
    /^(?:\/(?!\/)[A-Za-z0-9/_#?=&.-]*|#[A-Za-z][A-Za-z0-9_-]*)$/,
    'Use a safe internal URL.',
  )
  .max(240);

export const publicPageFocalPointSchema = z.enum(['left', 'center', 'right']);

const mediaSchema = z
  .object({
    mediaRef: mediaRefSchema,
    altText: optionalPlainText(240),
    focalPoint: publicPageFocalPointSchema.default('center'),
  })
  .strict();

const publicMediaSchema = mediaSchema
  .omit({ mediaRef: true })
  .extend({ imageUrl: z.string().startsWith('/').nullable() })
  .strict();

const ctaSchema = z
  .object({ label: plainText(80), href: internalHrefSchema })
  .strict();

const seoSchema = z
  .object({
    title: optionalPlainText(160),
    description: optionalPlainText(500),
    socialTitle: optionalPlainText(160),
    socialDescription: optionalPlainText(500),
    socialImage: mediaSchema,
  })
  .strict();

const publicSeoSchema = seoSchema
  .omit({ socialImage: true })
  .extend({ socialImage: publicMediaSchema })
  .strict();

const heroSchema = z
  .object({
    eyebrow: plainText(100),
    title: plainText(180),
    description: plainText(700),
    image: mediaSchema,
    primaryCta: ctaSchema.nullable(),
    secondaryCta: ctaSchema.nullable(),
  })
  .strict();

const publicHeroSchema = heroSchema
  .omit({ image: true })
  .extend({ image: publicMediaSchema })
  .strict();

const visibleSectionSchema = z.object({ visible: z.boolean() }).strict();

const imageCardSchema = z
  .object({
    title: plainText(100),
    description: plainText(320),
    href: internalHrefSchema.nullable(),
    image: mediaSchema,
  })
  .strict();

const publicImageCardSchema = imageCardSchema
  .omit({ image: true })
  .extend({ image: publicMediaSchema })
  .strict();

export const aboutPageContentSchema = z
  .object({
    hero: heroSchema,
    introduction: visibleSectionSchema.extend({
      eyebrow: plainText(100),
      title: plainText(180),
      body: plainText(3000),
      image: mediaSchema,
    }),
    audiences: visibleSectionSchema.extend({
      eyebrow: plainText(100),
      title: plainText(180),
      items: z.array(imageCardSchema).min(2).max(6),
    }),
    benefits: visibleSectionSchema.extend({
      eyebrow: plainText(100),
      title: plainText(180),
      items: z
        .array(
          z
            .object({ title: plainText(100), description: plainText(400) })
            .strict(),
        )
        .min(2)
        .max(6),
    }),
    process: visibleSectionSchema.extend({
      eyebrow: plainText(100),
      title: plainText(180),
      items: z
        .array(
          z
            .object({ title: plainText(100), description: plainText(400) })
            .strict(),
        )
        .min(2)
        .max(6),
    }),
    statement: visibleSectionSchema.extend({
      title: plainText(240),
      description: plainText(800),
      image: mediaSchema,
    }),
    finalCta: visibleSectionSchema.extend({
      title: plainText(180),
      description: plainText(600),
      primaryCta: ctaSchema,
      secondaryCta: ctaSchema.nullable(),
    }),
  })
  .strict();

export const publicAboutPageContentSchema = aboutPageContentSchema
  .omit({
    hero: true,
    introduction: true,
    audiences: true,
    statement: true,
  })
  .extend({
    hero: publicHeroSchema,
    introduction: aboutPageContentSchema.shape.introduction
      .omit({ image: true })
      .extend({ image: publicMediaSchema }),
    audiences: aboutPageContentSchema.shape.audiences
      .omit({ items: true })
      .extend({ items: z.array(publicImageCardSchema) }),
    statement: aboutPageContentSchema.shape.statement
      .omit({ image: true })
      .extend({ image: publicMediaSchema }),
  })
  .strict();

export const contactPageContentSchema = z
  .object({
    hero: heroSchema,
    intro: visibleSectionSchema.extend({
      eyebrow: plainText(100),
      title: plainText(180),
      description: plainText(900),
    }),
    contactCards: visibleSectionSchema.extend({
      phoneLabel: plainText(80),
      phoneDescription: plainText(240),
      emailLabel: plainText(80),
      emailDescription: plainText(240),
      locationLabel: plainText(80),
      locationDescription: plainText(240),
    }),
    formSupport: visibleSectionSchema.extend({
      title: plainText(180),
      description: plainText(800),
      guidanceTitle: plainText(120),
      guidance: z.array(plainText(240)).min(1).max(6),
      image: mediaSchema,
    }),
    rentalHelp: visibleSectionSchema.extend({
      title: plainText(180),
      description: plainText(600),
      primaryCta: ctaSchema,
      secondaryCta: ctaSchema.nullable(),
    }),
    faq: visibleSectionSchema.extend({
      eyebrow: plainText(100),
      title: plainText(180),
      items: z
        .array(
          z
            .object({ question: plainText(180), answer: plainText(900) })
            .strict(),
        )
        .min(1)
        .max(10),
    }),
  })
  .strict();

export const publicContactPageContentSchema = contactPageContentSchema
  .omit({ hero: true, formSupport: true })
  .extend({
    hero: publicHeroSchema,
    formSupport: contactPageContentSchema.shape.formSupport
      .omit({ image: true })
      .extend({ image: publicMediaSchema }),
  })
  .strict();

const legalSectionSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(80),
    title: plainText(180),
    body: plainText(12_000),
  })
  .strict();

export const legalPageContentSchema = z
  .object({
    hero: heroSchema.omit({ primaryCta: true, secondaryCta: true }),
    lastUpdated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notice: optionalPlainText(900),
    sections: z
      .array(legalSectionSchema)
      .min(1)
      .max(30)
      .refine(
        (items) => new Set(items.map((item) => item.id)).size === items.length,
        {
          message: 'Legal section anchors must be unique.',
        },
      ),
  })
  .strict();

export const publicLegalPageContentSchema = legalPageContentSchema
  .omit({ hero: true })
  .extend({
    hero: legalPageContentSchema.shape.hero
      .omit({ image: true })
      .extend({ image: publicMediaSchema }),
  })
  .strict();

export const publicPageSeoSchema = seoSchema;
export const publishedPublicPageSeoSchema = publicSeoSchema;

export const publishedPublicPageResponseSchema = z.discriminatedUnion('key', [
  z
    .object({
      key: z.literal('ABOUT'),
      content: publicAboutPageContentSchema,
      seo: publicSeoSchema,
      publishedAt: z.string().datetime().nullable(),
    })
    .strict(),
  z
    .object({
      key: z.literal('CONTACT'),
      content: publicContactPageContentSchema,
      seo: publicSeoSchema,
      publishedAt: z.string().datetime().nullable(),
    })
    .strict(),
  z
    .object({
      key: z.enum(['TERMS', 'PRIVACY']),
      content: publicLegalPageContentSchema,
      seo: publicSeoSchema,
      publishedAt: z.string().datetime().nullable(),
    })
    .strict(),
]);

export const savePublicPageDraftSchema = z
  .object({
    expectedLockVersion: z.number().int().min(0),
    operationId: z.string().uuid(),
    content: z.unknown(),
    seo: seoSchema,
  })
  .strict();

export const publicPageMutationSchema = z
  .object({
    expectedLockVersion: z.number().int().min(0),
    operationId: z.string().uuid(),
  })
  .strict();

export const publicPageRevisionParamSchema = z.string().cuid();

export type PublicPageKey = z.infer<typeof publicPageKeySchema>;
export type PublicPageSeo = z.infer<typeof seoSchema>;
export type PublishedPublicPageSeo = z.infer<typeof publicSeoSchema>;
export type AboutPageContent = z.infer<typeof aboutPageContentSchema>;
export type PublicAboutPageContent = z.infer<
  typeof publicAboutPageContentSchema
>;
export type ContactPageContent = z.infer<typeof contactPageContentSchema>;
export type PublicContactPageContent = z.infer<
  typeof publicContactPageContentSchema
>;
export type LegalPageContent = z.infer<typeof legalPageContentSchema>;
export type PublicLegalPageContent = z.infer<
  typeof publicLegalPageContentSchema
>;
export type SavePublicPageDraftInput = z.infer<
  typeof savePublicPageDraftSchema
>;
export type PublicPageMutationInput = z.infer<typeof publicPageMutationSchema>;

export function parsePublicPageContent(key: PublicPageKey, input: unknown) {
  if (key === 'ABOUT') return aboutPageContentSchema.parse(input);
  if (key === 'CONTACT') return contactPageContentSchema.parse(input);
  return legalPageContentSchema.parse(input);
}

const emptyMedia = {
  mediaRef: null,
  altText: '',
  focalPoint: 'center' as const,
};
const emptySeoImage = { ...emptyMedia };

export const DEFAULT_PUBLIC_PAGE_SEO: Record<PublicPageKey, PublicPageSeo> = {
  ABOUT: {
    title: 'About Mensah Rentals & Services',
    description:
      'Learn how Mensah Rentals & Services supports events, film productions, and projects through a reviewed rental-request and custom-quote process.',
    socialTitle: 'About Mensah Rentals & Services',
    socialDescription:
      'Equipment support built around real-world event, production, and project requirements.',
    socialImage: emptySeoImage,
  },
  CONTACT: {
    title: 'Contact Mensah Rentals & Services',
    description:
      'Contact Mensah Rentals & Services about equipment rentals for an event, production, or project in Richmond, British Columbia.',
    socialTitle: 'Contact Mensah Rentals & Services',
    socialDescription:
      'Tell our team what your event, production, or project needs.',
    socialImage: emptySeoImage,
  },
  TERMS: {
    title: 'Website and Rental Terms',
    description:
      'Terms for using the Mensah Rentals rental-request website and the controlled customer rental terms used on official forms.',
    socialTitle: 'Website and Rental Terms | Mensah Rentals',
    socialDescription:
      'Website and rental terms for Mensah Rentals & Services.',
    socialImage: emptySeoImage,
  },
  PRIVACY: {
    title: 'Privacy Policy',
    description:
      'How Mensah Rentals & Services handles information submitted through contact enquiries, rental requests, quotes, orders, and this website.',
    socialTitle: 'Privacy Policy | Mensah Rentals',
    socialDescription:
      'How Mensah Rentals & Services handles information across the rental-request platform.',
    socialImage: emptySeoImage,
  },
};

export const DEFAULT_ABOUT_PAGE_CONTENT: AboutPageContent = {
  hero: {
    eyebrow: 'About Mensah Rentals',
    title: 'Equipment support built around real-world needs',
    description:
      'Mensah Rentals & Services supports events, film productions, worksites, and organized projects through a clear, staff-reviewed rental process.',
    image: {
      ...emptyMedia,
      altText: 'Mensah Rentals equipment prepared for a project',
    },
    primaryCta: { label: 'Browse rentals', href: '/rentals' },
    secondaryCta: { label: 'Contact us', href: '/contact' },
  },
  introduction: {
    visible: true,
    eyebrow: 'A practical rental partner',
    title: 'The equipment matters. So does the way it reaches your project.',
    body: 'Mensah Rentals & Services Inc. provides equipment rental support for events, film productions, worksites, and other organized projects. Customers describe what they need and when they need it; our team reviews those requirements privately before confirming quantities, pricing, and the appropriate fulfilment plan.',
    image: {
      ...emptyMedia,
      altText: 'Organized rental equipment ready for use',
    },
  },
  audiences: {
    visible: true,
    eyebrow: 'Who we serve',
    title: 'Equipment for the environments where details matter',
    items: [
      {
        title: 'Events & gatherings',
        description:
          'Practical equipment for planned events and community gatherings.',
        href: '/rentals',
        image: {
          ...emptyMedia,
          altText: 'Equipment for events and gatherings',
        },
      },
      {
        title: 'Film & production',
        description:
          'Rental support for production schedules and organized sets.',
        href: '/rentals',
        image: {
          ...emptyMedia,
          altText: 'Equipment supporting a film production',
        },
      },
      {
        title: 'Worksites & traffic control',
        description:
          'Equipment for structured site and traffic-control requirements.',
        href: '/rentals',
        image: { ...emptyMedia, altText: 'Equipment prepared for a worksite' },
      },
      {
        title: 'Community projects',
        description:
          'Flexible rental requests for projects of different sizes.',
        href: '/rentals',
        image: {
          ...emptyMedia,
          altText: 'Equipment supporting a community project',
        },
      },
    ],
  },
  benefits: {
    visible: true,
    eyebrow: 'Why work with us',
    title: 'A reviewed process, shaped around the request',
    items: [
      {
        title: 'Flexible equipment selection',
        description:
          'Build a complete list from the public catalogue without being restricted by public stock messages.',
      },
      {
        title: 'Staff-reviewed requests',
        description:
          'Authorized staff review dates, desired quantities, and internal availability before confirming supply.',
      },
      {
        title: 'Pickup and delivery coordination',
        description:
          'Fulfilment details are coordinated as part of the confirmed rental workflow.',
      },
      {
        title: 'Clear operational stages',
        description:
          'Requests, quotes, orders, fulfilment, and returns remain distinct and accountable.',
      },
    ],
  },
  process: {
    visible: true,
    eyebrow: 'How it works',
    title: 'A clear path from equipment search to coordinated handoff',
    items: [
      {
        title: 'Browse',
        description:
          'Explore equipment information without public inventory counts.',
      },
      {
        title: 'Request',
        description: 'Share dates, quantities, and project details.',
      },
      {
        title: 'Staff review',
        description:
          'The team reviews requirements and prepares the appropriate response.',
      },
      {
        title: 'Pickup or delivery',
        description: 'Confirmed equipment is prepared for the agreed handoff.',
      },
    ],
  },
  statement: {
    visible: true,
    title: 'Equipment should support the work—not complicate it.',
    description:
      'Our platform keeps the customer journey straightforward while preserving the careful internal review that rental operations require.',
    image: {
      ...emptyMedia,
      altText: 'Rental equipment supporting organized work',
    },
  },
  finalCta: {
    visible: true,
    title: 'Planning an event, production, or project?',
    description:
      'Explore the catalogue or tell the Mensah Rentals team what you are organizing.',
    primaryCta: { label: 'Browse rental equipment', href: '/rentals' },
    secondaryCta: { label: 'Contact Mensah Rentals', href: '/contact' },
  },
};

export const DEFAULT_CONTACT_PAGE_CONTENT: ContactPageContent = {
  hero: {
    eyebrow: 'Contact Mensah Rentals',
    title: 'Let’s talk about what your project needs',
    description:
      'Share the equipment, timing, and support you are considering. Our team will review your enquiry and respond through the appropriate rental workflow.',
    image: {
      ...emptyMedia,
      altText: 'Mensah Rentals equipment and customer support',
    },
    primaryCta: { label: 'Send an enquiry', href: '#contact-form' },
    secondaryCta: { label: 'Browse rentals', href: '/rentals' },
  },
  intro: {
    visible: true,
    eyebrow: 'Start the conversation',
    title: 'Clear information helps us point you in the right direction',
    description:
      'Use the contact form for general questions or early project planning. If you already know the equipment and quantities you want, browse the catalogue and prepare a rental request.',
  },
  contactCards: {
    visible: true,
    phoneLabel: 'Call our team',
    phoneDescription: 'Speak with Mensah Rentals about your rental needs.',
    emailLabel: 'Send an email',
    emailDescription: 'Use email for general business enquiries.',
    locationLabel: 'Service area',
    locationDescription: 'Based in Richmond, British Columbia.',
  },
  formSupport: {
    visible: true,
    title: 'Send an enquiry',
    description:
      'Tell us enough about your event, production, or project for the team to understand the request.',
    guidanceTitle: 'Helpful details to include',
    guidance: [
      'The type of event, production, or project',
      'Dates and general location',
      'Equipment or support you are considering',
    ],
    image: {
      ...emptyMedia,
      altText: 'Organized rental equipment ready for customer enquiries',
    },
  },
  rentalHelp: {
    visible: true,
    title: 'Already know which equipment you need?',
    description:
      'Browse the catalogue first to build a clear equipment list, then continue through the available request or contact path.',
    primaryCta: { label: 'Browse rentals', href: '/rentals' },
    secondaryCta: {
      label: 'How rental requests work',
      href: '/about#how-it-works',
    },
  },
  faq: {
    visible: true,
    eyebrow: 'Before you contact us',
    title: 'A few useful answers',
    items: [
      {
        question: 'How do I request equipment?',
        answer:
          'Browse the catalogue, choose the quantities you want, and use the available rental-request workflow. When online requests are unavailable, contact the team instead.',
      },
      {
        question: 'Can I request multiple quantities?',
        answer:
          'Yes. Customers may request the quantities they need. Internal availability is reviewed privately by staff.',
      },
      {
        question: 'How is a rental confirmed?',
        answer:
          'A submitted request is reviewed by staff. Where appropriate, a custom quote is prepared, and an accepted quote can become a confirmed rental order.',
      },
      {
        question: 'Can pickup or delivery be arranged?',
        answer:
          'Pickup or delivery details are coordinated during the confirmed rental workflow according to the project requirements.',
      },
    ],
  },
};

export const DEFAULT_TERMS_PAGE_CONTENT: LegalPageContent = {
  hero: {
    eyebrow: 'Legal information',
    title: 'Website and rental terms',
    description:
      'These terms explain the website workflow and reproduce the controlled rental terms used on official Mensah Rentals customer forms.',
    image: {
      ...emptyMedia,
      altText: 'Mensah Rentals equipment prepared for documented rental use',
    },
  },
  lastUpdated: '2026-08-28',
  notice:
    'These terms should be reviewed by Mensah Rentals and qualified legal counsel before production launch.',
  sections: [
    {
      id: 'website-purpose',
      title: 'Website purpose',
      body: 'This website is a rental-request platform, not an automatic-price ecommerce checkout. Browsing equipment, adding equipment to a cart, submitting a request, or sending a contact enquiry does not confirm inventory availability, reserve equipment, establish a final price, or create a confirmed rental order.',
    },
    {
      id: 'rental-workflow',
      title: 'Rental request and quote workflow',
      body: 'Mensah Rentals reviews submitted requirements privately. Authorized staff may approve, partially approve, or reject requested quantities and may prepare a custom quote. A confirmed rental order is created only through the applicable acceptance and confirmation workflow.',
    },
    {
      id: 'information-you-submit',
      title: 'Information you submit',
      body: 'You are responsible for providing accurate contact, event or project, date, fulfilment, and requested-equipment information. Do not submit unlawful content, malicious code, passwords, payment-card information, or confidential information that is not needed for the enquiry or rental workflow.',
    },
    {
      id: 'acceptable-use',
      title: 'Acceptable use and access controls',
      body: 'Do not disrupt the service, submit abusive automated traffic, attempt to bypass private capabilities or staff authorization, probe another customer’s data, or misuse third-party content. A reference number, name, email address, or event name does not by itself authorize access to private rental information.',
    },
    {
      id: 'third-party-content',
      title: 'Third-party content',
      body: 'Google Maps ratings, reviews, attribution, and source links are supplied by Google. Their display and use are also subject to the Google Terms of Service and applicable Google Maps Platform terms.',
    },
    {
      id: 'official-form-terms',
      title: 'Controlled official customer-form terms',
      body: 'The eight controlled clauses and acknowledgement reproduced on official Order and Return Forms remain authoritative form content. Their references to charges do not mean this public website invents or calculates a customer-specific price.',
    },
    {
      id: 'rental-documents',
      title: 'Rental-specific documents',
      body: 'A quote, confirmed rental order, official Order Form, Return Form, or other customer document may contain additional terms or project-specific details. Those confirmed documents remain separate from these general website terms and should be read carefully.',
    },
    {
      id: 'contact',
      title: 'Contact',
      body: 'Questions about these terms can be sent through the Contact page, by email to info@mensahrentals.com, or by phone at (604) 644-5265.',
    },
  ],
};

export const DEFAULT_PRIVACY_PAGE_CONTENT: LegalPageContent = {
  hero: {
    eyebrow: 'Privacy information',
    title: 'Privacy policy',
    description:
      'How Mensah Rentals & Services handles information submitted through enquiries, rental workflows, and this website.',
    image: {
      ...emptyMedia,
      altText: 'Mensah Rentals equipment and protected customer information',
    },
  },
  lastUpdated: '2026-08-28',
  notice:
    'This policy should be reviewed by Mensah Rentals and qualified privacy counsel before production launch.',
  sections: [
    {
      id: 'operator',
      title: 'Who operates this website',
      body: 'Mensah Rentals & Services Inc. operates this equipment rental-request platform. The business can be contacted through the Contact page, at info@mensahrentals.com, or at (604) 644-5265.',
    },
    {
      id: 'information-collected',
      title: 'Information collected',
      body: 'The platform may collect information provided in a contact enquiry, rental cart or request, request amendment, formal change request, quote response, and confirmed-order workflow. This may include name, email, phone, company, project details, requested equipment and quantities, dates, fulfilment information, delivery address, notes, and customer-document responses.',
    },
    {
      id: 'information-use',
      title: 'How information is used',
      body: 'Information is used to receive and review enquiries and rental requests, communicate about a project, prepare and manage quotes and confirmed orders, coordinate fulfilment and returns, maintain operational history, protect private access, investigate errors or abuse, and meet applicable business or legal obligations.',
    },
    {
      id: 'contact-enquiries',
      title: 'Contact enquiries',
      body: 'A successfully submitted contact enquiry is stored for authorized staff review. The current platform does not claim the message was delivered by email. Spam-prevention controls include a hidden honeypot, bounded request sizes, exact request-origin checks, validation, and rate limiting.',
    },
    {
      id: 'private-access',
      title: 'Private access and cookies',
      body: 'Rental-cart and private customer workflows use secure, scoped browser cookies where needed. Private request, quote, and order access uses opaque capabilities. Raw capability and session secrets are not included in public responses or logs. Admin uses an HTTP-only staff session cookie. Theme preference is stored in the browser.',
    },
    {
      id: 'google-content',
      title: 'Google Maps review content',
      body: 'When enabled, the homepage retrieves current ratings and reviews through the Mensah Rentals server. The platform does not permanently store returned review text, reviewer names, profile links, photographs, ratings, or dates. Reviewer images load from Google servers when displayed.',
    },
    {
      id: 'sharing',
      title: 'Sharing and public visibility',
      body: 'Customer contact and rental workflow information is not intended for public catalogue responses. Authorized staff access records required for their work according to backend permissions. Service infrastructure and third-party providers may process information only as needed to operate the platform.',
    },
    {
      id: 'security-retention',
      title: 'Security and retention',
      body: 'The platform uses validation, access controls, private caching rules, password hashing, database-backed staff sessions, audit logging, and other safeguards. No system can guarantee absolute security. Operational records are retained according to business, legal, security, and workflow needs; this policy does not promise an unverified fixed retention period.',
    },
    {
      id: 'questions',
      title: 'Your questions and requests',
      body: 'To ask a privacy question or make a request concerning information you supplied, use the Contact page or the verified business contact details above. Mensah Rentals may need to verify identity and the relevant record before responding.',
    },
  ],
};

export const DEFAULT_PUBLIC_PAGE_CONTENT = {
  ABOUT: DEFAULT_ABOUT_PAGE_CONTENT,
  CONTACT: DEFAULT_CONTACT_PAGE_CONTENT,
  TERMS: DEFAULT_TERMS_PAGE_CONTENT,
  PRIVACY: DEFAULT_PRIVACY_PAGE_CONTENT,
} satisfies Record<
  PublicPageKey,
  AboutPageContent | ContactPageContent | LegalPageContent
>;
