import type {
  GalleryProjectContentInput,
  GalleryServiceSlug,
  GalleryServiceType,
} from '@mensah-rentals/validation';

export interface PublicGalleryMediaResponse {
  altText: string;
  focalPoint: string;
  url: string;
}

export interface PublicGalleryProjectSummaryResponse {
  eventDate: string | null;
  imageCount: number;
  location: string | null;
  cover: PublicGalleryMediaResponse;
  service: {
    label: string;
    slug: GalleryServiceSlug;
  };
  shortDescription: string;
  slug: string;
  title: string;
}

export interface PublicGalleryProjectResponse
  extends PublicGalleryProjectSummaryResponse {
  description: string | null;
  media: PublicGalleryMediaResponse[];
  seo: { title: string; description: string };
}

export interface PublicGalleryResponse {
  items: PublicGalleryProjectSummaryResponse[];
  selectedType: GalleryServiceSlug | null;
  services: Array<{ label: string; slug: GalleryServiceSlug }>;
}

export interface AdminGalleryMediaResponse {
  altText: string;
  focalPoint: string;
  mediaId: string;
  url: string;
}

export interface AdminGalleryRevisionResponse {
  content: GalleryProjectContentInput;
  createdAt: string;
  id: string;
  kind: 'DRAFT' | 'PUBLISHED';
  media: AdminGalleryMediaResponse[];
  publishedAt: string | null;
  version: number;
}

export interface AdminGalleryProjectSummaryResponse {
  archivedAt: string | null;
  coverUrl: string | null;
  id: string;
  lockVersion: number;
  published: boolean;
  serviceType: GalleryServiceType;
  slug: string;
  title: string;
  updatedAt: string;
}

export interface AdminGalleryProjectResponse
  extends AdminGalleryProjectSummaryResponse {
  draft: AdminGalleryRevisionResponse | null;
  history: AdminGalleryRevisionResponse[];
  publishedRevision: AdminGalleryRevisionResponse | null;
}

export interface AdminGalleryListResponse {
  items: AdminGalleryProjectSummaryResponse[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
