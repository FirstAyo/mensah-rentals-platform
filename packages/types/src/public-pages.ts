import type {
  AboutPageContent,
  ContactPageContent,
  LegalPageContent,
  PublicAboutPageContent,
  PublicContactPageContent,
  PublicLegalPageContent,
  PublicPageKey,
  PublicPageSeo,
  PublishedPublicPageSeo,
} from '@mensah-rentals/validation';

export type PublicPageAdminRevision = {
  id: string;
  version: number;
  status: 'DRAFT' | 'PUBLISHED';
  content: AboutPageContent | ContactPageContent | LegalPageContent;
  seo: PublicPageSeo;
  media: Array<{
    id: string;
    mediaRef: string;
    source: 'HOMEPAGE' | 'PRODUCT';
    url: string;
    label: string;
    description: string;
    width: number | null;
    height: number | null;
    byteSize: number | null;
    usageCount: number;
    productName: string | null;
  }>;
  createdAt: string;
  publishedAt: string | null;
  createdBy: { id: string; firstName: string; lastName: string } | null;
  publishedBy: { id: string; firstName: string; lastName: string } | null;
};

export type PublicPageAdminDetail = {
  key: PublicPageKey;
  label: string;
  lockVersion: number;
  draft: PublicPageAdminRevision | null;
  published: PublicPageAdminRevision;
  revisions: Array<
    Pick<
      PublicPageAdminRevision,
      | 'id'
      | 'version'
      | 'status'
      | 'createdAt'
      | 'publishedAt'
      | 'createdBy'
      | 'publishedBy'
    >
  >;
};

export type PublicPageAdminSummary = {
  key: PublicPageKey;
  label: string;
  lockVersion: number;
  draftVersion: number | null;
  publishedVersion: number;
  publishedAt: string | null;
};

export type PublicPageAdminListResponse = {
  items: PublicPageAdminSummary[];
};

export type PublishedPublicPageResponse =
  | {
      key: 'ABOUT';
      content: PublicAboutPageContent;
      seo: PublishedPublicPageSeo;
      publishedAt: string | null;
    }
  | {
      key: 'CONTACT';
      content: PublicContactPageContent;
      seo: PublishedPublicPageSeo;
      publishedAt: string | null;
    }
  | {
      key: 'TERMS' | 'PRIVACY';
      content: PublicLegalPageContent;
      seo: PublishedPublicPageSeo;
      publishedAt: string | null;
    };
