'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  DEFAULT_HOMEPAGE_CONTENT,
  googleReviewsAdminStatusSchema,
  googleReviewsAdminTestSchema,
  homepageContentSchema,
  type GoogleReviewsAdminStatus,
  type GoogleReviewsAdminTest,
  type HomepageContent,
} from '@mensah-rentals/validation';
import { ExternalLink, RefreshCw, RotateCcw, Save, Send } from 'lucide-react';
import {
  MediaAssignmentField,
  type MediaLibraryItem,
} from './media-picker-dialog';
import { AccessibleDialog } from './accessible-dialog';

type Revision = {
  id: string;
  version: number;
  kind: 'DRAFT' | 'PUBLISHED';
  content: HomepageContent;
  featuredCategoryIds: string[];
  featuredCategoryOverrides: CategoryOverride[];
  featuredProductIds: string[];
  media: Media[];
  createdAt: string;
  publishedAt: string | null;
};
type Media = MediaLibraryItem;
type CategoryOverride = {
  categoryId: string;
  mediaRef: string | null;
  altText: string;
  focalPoint: 'center' | 'top' | 'bottom' | 'left' | 'right';
};
type CategoryImageSource =
  | 'CATEGORY_COVER'
  | 'PRODUCT_FALLBACK'
  | 'DEFAULT_FALLBACK';
type CatalogueItem = { id: string; name: string; slug: string };
type State = {
  lockVersion: number;
  draft: Revision | null;
  published: Revision | null;
  revisions: Array<{
    id: string;
    version: number;
    kind: string;
    publishedAt: string | null;
  }>;
  defaultContent: HomepageContent;
};

const controlClass =
  'w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60';
const inputClass = `h-11 ${controlClass}`;
const labelClass = 'grid gap-2 text-sm font-medium';
const HOMEPAGE_ICONS = [
  'badge-check',
  'calendar-check',
  'clipboard-check',
  'clock',
  'headphones',
  'map-pin',
  'package-check',
  'shield-check',
  'sparkles',
  'truck',
  'users',
  'warehouse',
] as const;

function moveItem<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

export function HomepageEditor({
  canEdit,
  canPublish,
  canManageMedia,
  canPreview,
  canViewGoogleReviewsStatus,
}: {
  canEdit: boolean;
  canPublish: boolean;
  canManageMedia: boolean;
  canPreview: boolean;
  canViewGoogleReviewsStatus: boolean;
}) {
  const [state, setState] = useState<State | null>(null);
  const [content, setContent] = useState<HomepageContent>(
    DEFAULT_HOMEPAGE_CONTENT,
  );
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [categoryOverrides, setCategoryOverrides] = useState<
    CategoryOverride[]
  >([]);
  const [categoryImageSources, setCategoryImageSources] = useState<
    Record<string, CategoryImageSource>
  >({});
  const [categories, setCategories] = useState<CatalogueItem[]>([]);
  const [products, setProducts] = useState<CatalogueItem[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleStatus, setGoogleStatus] =
    useState<GoogleReviewsAdminStatus | null>(null);
  const [googleTest, setGoogleTest] = useState<GoogleReviewsAdminTest | null>(
    null,
  );
  const [googleBusy, setGoogleBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<
    { kind: 'publish' } | { kind: 'restore'; id: string } | null
  >(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  async function load() {
    const [home, cats, prods, mediaResponse] = await Promise.all([
      fetch('/api/homepage', { cache: 'no-store' }),
      fetch(
        '/api/catalogue/categories?page=1&pageSize=100&sortBy=sortOrder&sortDirection=asc',
        { cache: 'no-store' },
      ),
      fetch(
        '/api/catalogue/products?page=1&pageSize=100&sortBy=name&sortDirection=asc',
        { cache: 'no-store' },
      ),
      fetch('/api/homepage/media/library?page=1&pageSize=50&source=ALL', {
        cache: 'no-store',
      }),
    ]);
    if (!home.ok) throw new Error('Homepage content could not be loaded.');
    const next: State = await home.json();
    const source = next.draft ?? next.published;
    setState(next);
    setContent(source?.content ?? next.defaultContent);
    setCategoryIds(source?.featuredCategoryIds ?? []);
    setProductIds(source?.featuredProductIds ?? []);
    setCategoryOverrides(source?.featuredCategoryOverrides ?? []);
    if (cats.ok) setCategories((await cats.json()).items ?? []);
    if (prods.ok) setProducts((await prods.json()).items ?? []);
    if (mediaResponse.ok) {
      const library = ((await mediaResponse.json()) as { items: Media[] })
        .items;
      const saved = source?.media ?? [];
      setMedia(
        [...saved, ...library].filter(
          (item, index, all) =>
            all.findIndex((entry) => entry.mediaRef === item.mediaRef) ===
            index,
        ),
      );
    } else {
      setMedia(source?.media ?? []);
    }
  }

  useEffect(() => {
    void load().catch((error) =>
      setMessage(
        error instanceof Error ? error.message : 'Unable to load homepage.',
      ),
    );
  }, []);

  useEffect(() => {
    if (!canViewGoogleReviewsStatus) return;
    void fetch('/api/homepage/google-reviews/status', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Status is unavailable.');
        setGoogleStatus(
          googleReviewsAdminStatusSchema.parse(await response.json()),
        );
      })
      .catch(() => setGoogleStatus(null));
  }, [canViewGoogleReviewsStatus]);

  useEffect(() => {
    if (!categoryIds.length) return;
    void Promise.all(
      categoryIds.map(async (categoryId) => {
        const response = await fetch(
          `/api/catalogue/categories/${categoryId}/cover-image`,
          { cache: 'no-store' },
        );
        if (!response.ok) return null;
        const body = (await response.json()) as {
          resolved: { source: CategoryImageSource };
        };
        return [categoryId, body.resolved.source] as const;
      }),
    ).then((entries) => {
      setCategoryImageSources(
        Object.fromEntries(entries.filter((entry) => entry !== null)),
      );
    });
  }, [categoryIds]);

  const active = state?.draft ?? state?.published;
  const dirty = useMemo(() => {
    if (!state) return false;
    const source = state.draft ?? state.published;
    return (
      JSON.stringify({
        content,
        categoryIds,
        productIds,
        categoryOverrides,
      }) !==
      JSON.stringify({
        content: source?.content ?? state.defaultContent,
        categoryIds: source?.featuredCategoryIds ?? [],
        productIds: source?.featuredProductIds ?? [],
        categoryOverrides: source?.featuredCategoryOverrides ?? [],
      })
    );
  }, [categoryIds, categoryOverrides, content, productIds, state]);

  function rememberMedia(item: Media) {
    setMedia((current) => [
      item,
      ...current.filter((entry) => entry.mediaRef !== item.mediaRef),
    ]);
  }

  function currentMedia(reference: string | null) {
    return reference
      ? (media.find((item) => item.mediaRef === reference) ?? null)
      : null;
  }
  const sectionKeys = useMemo(
    () =>
      [
        'featuredCategories',
        'benefits',
        'featuredProducts',
        'process',
        'solutions',
        'reviews',
        'pickupDelivery',
        'serviceAreas',
      ] as const,
    [],
  );

  function updateSection(
    key: (typeof sectionKeys)[number],
    field: 'eyebrow' | 'heading' | 'description',
    value: string,
  ) {
    setContent((current) => ({
      ...current,
      [key]: { ...current[key], [field]: value },
    }));
  }

  async function saveDraft() {
    if (!state || !canEdit || busy) return;
    const parsed = homepageContentSchema.safeParse(content);
    if (!parsed.success) {
      setMessage(
        parsed.error.issues[0]?.message ??
          'Please correct the homepage fields.',
      );
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/homepage/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedLockVersion: state.lockVersion,
          operationId: crypto.randomUUID(),
          content: parsed.data,
          featuredCategoryIds: categoryIds,
          featuredCategoryOverrides: categoryOverrides,
          featuredProductIds: productIds,
        }),
      });
      if (!response.ok)
        throw new Error(
          (await response.json()).message ?? 'Draft could not be saved.',
        );
      setMessage('Draft saved. Published content is unchanged.');
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Draft could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!state?.draft || !canPublish || busy) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/homepage/drafts/${state.draft.id}/publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedLockVersion: state.lockVersion,
            operationId: crypto.randomUUID(),
          }),
        },
      );
      if (!response.ok)
        throw new Error((await response.json()).message ?? 'Publish failed.');
      setMessage('Homepage published.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Publish failed.');
    } finally {
      setBusy(false);
    }
  }

  async function restore(id: string) {
    if (!state || !canPublish || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/homepage/revisions/${id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedLockVersion: state.lockVersion,
          operationId: crypto.randomUUID(),
        }),
      });
      if (!response.ok)
        throw new Error((await response.json()).message ?? 'Restore failed.');
      setMessage('Historical publication restored.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Restore failed.');
    } finally {
      setBusy(false);
    }
  }

  async function testGoogleConnection() {
    if (!canViewGoogleReviewsStatus || googleBusy) return;
    setGoogleBusy(true);
    setGoogleTest(null);
    try {
      const response = await fetch('/api/homepage/google-reviews/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error('Connection test failed.');
      setGoogleTest(googleReviewsAdminTestSchema.parse(await response.json()));
    } catch {
      setGoogleTest({
        status: 'UPSTREAM_UNAVAILABLE',
        message: 'The connection test could not be completed.',
        businessName: null,
        rating: null,
        reviewCount: null,
        reviewsReturned: 0,
        attributionComplete: false,
      });
    } finally {
      setGoogleBusy(false);
    }
  }

  if (!state)
    return (
      <div className="rounded-xl border border-border p-8">
        {message || 'Loading homepage content…'}
      </div>
    );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Draft, preview, publish, and restore without changing catalogue or
            inventory data.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Content version {active?.version ?? 'default'} · Lock{' '}
            {state.lockVersion}
          </p>
        </div>
        <HomepageEditorActions
          busy={busy}
          canEdit={canEdit}
          canPreview={canPreview}
          canPublish={canPublish}
          dirty={dirty}
          draftId={state.draft?.id ?? null}
          onPublish={() => setConfirmation({ kind: 'publish' })}
          onSave={() => void saveDraft()}
        />
      </div>
      {message ? (
        <div
          aria-live="polite"
          className="rounded-lg border border-border bg-muted px-4 py-3 text-sm"
        >
          {message}
        </div>
      ) : null}

      {canViewGoogleReviewsStatus ? (
        <GoogleReviewsStatusPanel
          busy={googleBusy}
          onTest={() => void testGoogleConnection()}
          status={googleStatus}
          test={googleTest}
        />
      ) : null}

      {!canEdit ? (
        <p className="rounded-lg border border-border bg-muted px-4 py-3 text-sm">
          You have read-only homepage access. Editing and media-assignment
          controls are unavailable.
        </p>
      ) : null}

      <fieldset className="contents" disabled={!canEdit}>
        <Section title="SEO and social sharing">
          <TextField
            label="Page title"
            value={content.seo.title}
            onChange={(value) =>
              setContent({ ...content, seo: { ...content.seo, title: value } })
            }
          />
          <TextField
            label="Meta description"
            value={content.seo.description}
            onChange={(value) =>
              setContent({
                ...content,
                seo: { ...content.seo, description: value },
              })
            }
            textarea
          />
          <MediaAssignmentField
            canEdit={canEdit}
            canUpload={canManageMedia}
            current={currentMedia(content.seo.socialImageMediaId)}
            label="Social sharing image"
            onNotice={setMessage}
            onRemove={() =>
              setContent((current) => ({
                ...current,
                seo: { ...current.seo, socialImageMediaId: null },
              }))
            }
            onSelect={(item) => {
              rememberMedia(item);
              setContent((current) => ({
                ...current,
                seo: { ...current.seo, socialImageMediaId: item.mediaRef },
              }));
            }}
          />
        </Section>
        <Section title="Hero">
          <TextField
            label="Eyebrow"
            value={content.hero.eyebrow}
            onChange={(value) =>
              setContent({
                ...content,
                hero: { ...content.hero, eyebrow: value },
              })
            }
          />
          <TextField
            label="Heading"
            value={content.hero.heading}
            onChange={(value) =>
              setContent({
                ...content,
                hero: { ...content.hero, heading: value },
              })
            }
          />
          <TextField
            label="Description"
            value={content.hero.description}
            onChange={(value) =>
              setContent({
                ...content,
                hero: { ...content.hero, description: value },
              })
            }
            textarea
          />
          <TextField
            label="Primary button label"
            value={content.hero.primaryLabel}
            onChange={(value) =>
              setContent({
                ...content,
                hero: { ...content.hero, primaryLabel: value },
              })
            }
          />
          <TextField
            label="Primary button path"
            value={content.hero.primaryHref}
            onChange={(value) =>
              setContent({
                ...content,
                hero: { ...content.hero, primaryHref: value },
              })
            }
          />
          <TextField
            label="Secondary button label"
            value={content.hero.secondaryLabel}
            onChange={(value) =>
              setContent({
                ...content,
                hero: { ...content.hero, secondaryLabel: value },
              })
            }
          />
          <TextField
            label="Secondary button path"
            value={content.hero.secondaryHref}
            onChange={(value) =>
              setContent({
                ...content,
                hero: { ...content.hero, secondaryHref: value },
              })
            }
          />
          <label className={labelClass}>
            Slide interval in milliseconds (5,000 to 15,000)
            <input
              className={inputClass}
              type="number"
              min={5000}
              max={15000}
              step={500}
              value={content.hero.intervalMs}
              onChange={(event) =>
                setContent((current) => ({
                  ...current,
                  hero: {
                    ...current.hero,
                    intervalMs: Number(event.target.value),
                  },
                }))
              }
            />
          </label>
          <label className={labelClass}>
            Overlay intensity
            <select
              className={inputClass}
              value={content.hero.overlayIntensity}
              onChange={(event) =>
                setContent((current) => ({
                  ...current,
                  hero: {
                    ...current.hero,
                    overlayIntensity: event.target.value as
                      | 'LIGHT'
                      | 'MEDIUM'
                      | 'STRONG',
                  },
                }))
              }
            >
              <option value="LIGHT">Light (safe minimum)</option>
              <option value="MEDIUM">Medium</option>
              <option value="STRONG">Strong</option>
            </select>
          </label>
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={content.hero.autoplayEnabled}
              onChange={(event) =>
                setContent((current) => ({
                  ...current,
                  hero: {
                    ...current.hero,
                    autoplayEnabled: event.target.checked,
                  },
                }))
              }
            />
            Autoplay hero slides
          </label>
          <TextField
            label="Trust strip (one item per line)"
            value={content.trustItems.map((item) => item.label).join('\n')}
            onChange={(value) =>
              setContent({
                ...content,
                trustItems: value
                  .split('\n')
                  .map((item) => item.trim())
                  .filter(Boolean)
                  .slice(0, 4)
                  .map((label, index) => ({
                    label,
                    icon: content.trustItems[index]?.icon ?? 'shield-check',
                    enabled: content.trustItems[index]?.enabled ?? true,
                  })),
              })
            }
            textarea
          />
          <div className="col-span-full space-y-3">
            <h3 className="text-sm font-semibold">Hero slides</h3>
            <p className="text-sm text-muted-foreground">
              {content.hero.slides.length} slides configured ·{' '}
              {content.hero.slides.filter((slide) => slide.enabled).length}{' '}
              enabled ·{' '}
              {
                content.hero.slides.filter((slide) => slide.desktopMediaId)
                  .length
              }{' '}
              images assigned
            </p>
            {content.hero.slides.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Upload a homepage image below, then choose Hero.
              </p>
            ) : null}
            {content.hero.slides.map((slide, index) => (
              <fieldset
                className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-2"
                key={`${slide.desktopMediaId}-${index}`}
              >
                <legend className="px-1 text-sm font-medium">
                  Slide {index + 1}
                </legend>
                <TextField
                  label="Accessible image description"
                  value={slide.description}
                  onChange={(description) =>
                    setContent((current) => ({
                      ...current,
                      hero: {
                        ...current.hero,
                        slides: current.hero.slides.map((entry, itemIndex) =>
                          itemIndex === index
                            ? { ...entry, description }
                            : entry,
                        ),
                      },
                    }))
                  }
                />
                <MediaAssignmentField
                  canEdit={canEdit}
                  canUpload={canManageMedia}
                  current={currentMedia(slide.desktopMediaId)}
                  label={`Hero Slide ${index + 1}`}
                  onNotice={setMessage}
                  onRemove={() =>
                    setContent((current) => ({
                      ...current,
                      hero: {
                        ...current.hero,
                        slides: current.hero.slides.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      },
                    }))
                  }
                  onSelect={(item) => {
                    rememberMedia(item);
                    setContent((current) => ({
                      ...current,
                      hero: {
                        ...current.hero,
                        slides: current.hero.slides.map((entry, itemIndex) =>
                          itemIndex === index
                            ? { ...entry, desktopMediaId: item.mediaRef }
                            : entry,
                        ),
                      },
                    }));
                  }}
                />
                <MediaAssignmentField
                  canEdit={canEdit}
                  canUpload={canManageMedia}
                  current={currentMedia(slide.mobileMediaId)}
                  label={`Mobile hero image for Slide ${index + 1}`}
                  onNotice={setMessage}
                  onRemove={() =>
                    setContent((current) => ({
                      ...current,
                      hero: {
                        ...current.hero,
                        slides: current.hero.slides.map((entry, itemIndex) =>
                          itemIndex === index
                            ? { ...entry, mobileMediaId: null }
                            : entry,
                        ),
                      },
                    }))
                  }
                  onSelect={(item) => {
                    rememberMedia(item);
                    setContent((current) => ({
                      ...current,
                      hero: {
                        ...current.hero,
                        slides: current.hero.slides.map((entry, itemIndex) =>
                          itemIndex === index
                            ? { ...entry, mobileMediaId: item.mediaRef }
                            : entry,
                        ),
                      },
                    }));
                  }}
                />
                <label className={labelClass}>
                  Focal point
                  <select
                    className={inputClass}
                    value={slide.focalPoint}
                    onChange={(event) =>
                      setContent((current) => ({
                        ...current,
                        hero: {
                          ...current.hero,
                          slides: current.hero.slides.map((entry, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...entry,
                                  focalPoint: event.target.value as
                                    | 'center'
                                    | 'top'
                                    | 'bottom'
                                    | 'left'
                                    | 'right',
                                }
                              : entry,
                          ),
                        },
                      }))
                    }
                  >
                    {['center', 'top', 'bottom', 'left', 'right'].map(
                      (value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label className="flex items-center gap-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={slide.enabled}
                    onChange={(event) =>
                      setContent((current) => ({
                        ...current,
                        hero: {
                          ...current.hero,
                          slides: current.hero.slides.map((entry, itemIndex) =>
                            itemIndex === index
                              ? { ...entry, enabled: event.target.checked }
                              : entry,
                          ),
                        },
                      }))
                    }
                  />
                  Enabled
                </label>
                <button
                  className="justify-self-start rounded border border-destructive px-3 py-2 text-sm text-destructive"
                  type="button"
                  onClick={() =>
                    setContent((current) => ({
                      ...current,
                      hero: {
                        ...current.hero,
                        slides: current.hero.slides.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      },
                    }))
                  }
                >
                  Remove slide
                </button>
                <div className="flex gap-2">
                  <button
                    className="rounded border border-border px-3 py-2 text-sm disabled:opacity-40"
                    disabled={index === 0}
                    type="button"
                    onClick={() =>
                      setContent((current) => ({
                        ...current,
                        hero: {
                          ...current.hero,
                          slides: moveItem(
                            current.hero.slides,
                            index,
                            index - 1,
                          ),
                        },
                      }))
                    }
                  >
                    Move earlier
                  </button>
                  <button
                    className="rounded border border-border px-3 py-2 text-sm disabled:opacity-40"
                    disabled={index === content.hero.slides.length - 1}
                    type="button"
                    onClick={() =>
                      setContent((current) => ({
                        ...current,
                        hero: {
                          ...current.hero,
                          slides: moveItem(
                            current.hero.slides,
                            index,
                            index + 1,
                          ),
                        },
                      }))
                    }
                  >
                    Move later
                  </button>
                </div>
              </fieldset>
            ))}
            {content.hero.slides.length < 3 ? (
              <MediaAssignmentField
                canEdit={canEdit}
                canUpload={canManageMedia}
                current={null}
                label={`Hero Slide ${content.hero.slides.length + 1}`}
                onNotice={setMessage}
                onRemove={() => undefined}
                onSelect={(item) => {
                  rememberMedia(item);
                  setContent((current) => ({
                    ...current,
                    hero: {
                      ...current.hero,
                      slides: [
                        ...current.hero.slides,
                        {
                          desktopMediaId: item.mediaRef,
                          mobileMediaId: null,
                          description: item.description || item.label,
                          focalPoint: 'center',
                          enabled: true,
                        },
                      ],
                    },
                  }));
                }}
              />
            ) : (
              <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                Maximum of three hero slides configured.
              </p>
            )}
          </div>
          <div className="col-span-full grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {content.trustItems.map((item, index) => (
              <fieldset
                className="grid gap-2 rounded-lg border border-border p-3"
                key={`trust-${index}`}
              >
                <legend className="px-1 text-sm font-medium">
                  Trust item {index + 1}
                </legend>
                <label className={labelClass}>
                  Icon
                  <select
                    className={inputClass}
                    value={item.icon}
                    onChange={(event) =>
                      setContent((current) => ({
                        ...current,
                        trustItems: current.trustItems.map(
                          (entry, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...entry,
                                  icon: event.target.value as typeof entry.icon,
                                }
                              : entry,
                        ),
                      }))
                    }
                  >
                    {HOMEPAGE_ICONS.map((icon) => (
                      <option key={icon} value={icon}>
                        {icon}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={(event) =>
                      setContent((current) => ({
                        ...current,
                        trustItems: current.trustItems.map(
                          (entry, itemIndex) =>
                            itemIndex === index
                              ? { ...entry, enabled: event.target.checked }
                              : entry,
                        ),
                      }))
                    }
                  />
                  Visible
                </label>
              </fieldset>
            ))}
          </div>
        </Section>

        {sectionKeys.map((key) => (
          <Section key={key} title={key.replace(/([A-Z])/g, ' $1')}>
            <TextField
              label="Eyebrow"
              value={content[key].eyebrow}
              onChange={(value) => updateSection(key, 'eyebrow', value)}
            />
            <TextField
              label="Heading"
              value={content[key].heading}
              onChange={(value) => updateSection(key, 'heading', value)}
            />
            <TextField
              label="Description"
              value={content[key].description}
              onChange={(value) => updateSection(key, 'description', value)}
              textarea
            />
            <label className="flex items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                checked={content[key].enabled}
                onChange={(event) =>
                  setContent((current) => ({
                    ...current,
                    [key]: {
                      ...current[key],
                      enabled: event.target.checked,
                    },
                  }))
                }
              />
              Show this section publicly
            </label>
            <SectionDetails
              canEdit={canEdit}
              canManageMedia={canManageMedia}
              section={key}
              content={content}
              currentMedia={currentMedia}
              onNotice={setMessage}
              rememberMedia={rememberMedia}
              setContent={setContent}
            />
          </Section>
        ))}

        <Section title="Final call to action">
          <TextField
            label="Heading"
            value={content.finalCta.heading}
            onChange={(value) =>
              setContent({
                ...content,
                finalCta: { ...content.finalCta, heading: value },
              })
            }
          />
          <TextField
            label="Description"
            value={content.finalCta.description}
            onChange={(value) =>
              setContent({
                ...content,
                finalCta: { ...content.finalCta, description: value },
              })
            }
            textarea
          />
          <TextField
            label="Primary label"
            value={content.finalCta.primaryLabel}
            onChange={(value) =>
              setContent({
                ...content,
                finalCta: { ...content.finalCta, primaryLabel: value },
              })
            }
          />
          <TextField
            label="Primary path"
            value={content.finalCta.primaryHref}
            onChange={(value) =>
              setContent({
                ...content,
                finalCta: { ...content.finalCta, primaryHref: value },
              })
            }
          />
          <TextField
            label="Secondary label"
            value={content.finalCta.secondaryLabel}
            onChange={(value) =>
              setContent({
                ...content,
                finalCta: { ...content.finalCta, secondaryLabel: value },
              })
            }
          />
          <TextField
            label="Secondary path"
            value={content.finalCta.secondaryHref}
            onChange={(value) =>
              setContent({
                ...content,
                finalCta: { ...content.finalCta, secondaryHref: value },
              })
            }
          />
          <MediaAssignmentField
            canEdit={canEdit}
            canUpload={canManageMedia}
            current={currentMedia(content.finalCta.mediaId)}
            label="Final CTA"
            onNotice={setMessage}
            onRemove={() =>
              setContent((current) => ({
                ...current,
                finalCta: { ...current.finalCta, mediaId: null },
              }))
            }
            onSelect={(item) => {
              rememberMedia(item);
              setContent((current) => ({
                ...current,
                finalCta: { ...current.finalCta, mediaId: item.mediaRef },
              }));
            }}
          />
        </Section>

        <Selection
          title="Featured categories"
          items={categories}
          selected={categoryIds}
          max={8}
          onChange={setCategoryIds}
        />
        {categoryIds.length ? (
          <Section title="Featured category card images">
            {categoryIds.map((categoryId) => {
              const category = categories.find(
                (item) => item.id === categoryId,
              );
              const override = categoryOverrides.find(
                (item) => item.categoryId === categoryId,
              );
              return (
                <fieldset
                  className="col-span-full grid gap-4 rounded-xl border border-border p-4 md:grid-cols-2"
                  key={categoryId}
                >
                  <legend className="px-1 text-sm font-semibold">
                    {category?.name ?? 'Featured category'}
                  </legend>
                  <MediaAssignmentField
                    canEdit={canEdit}
                    canUpload={canManageMedia}
                    current={currentMedia(override?.mediaRef ?? null)}
                    label={`${category?.name ?? 'Category'} homepage override`}
                    onNotice={setMessage}
                    onRemove={() =>
                      setCategoryOverrides((current) =>
                        current.filter(
                          (item) => item.categoryId !== categoryId,
                        ),
                      )
                    }
                    onSelect={(item) => {
                      rememberMedia(item);
                      setCategoryOverrides((current) => [
                        ...current.filter(
                          (entry) => entry.categoryId !== categoryId,
                        ),
                        {
                          categoryId,
                          mediaRef: item.mediaRef,
                          altText: item.description || item.label,
                          focalPoint: 'center',
                        },
                      ]);
                    }}
                  />
                  <label className={labelClass}>
                    Alt text
                    <input
                      className={inputClass}
                      maxLength={300}
                      onChange={(event) =>
                        setCategoryOverrides((current) =>
                          current.map((item) =>
                            item.categoryId === categoryId
                              ? { ...item, altText: event.target.value }
                              : item,
                          ),
                        )
                      }
                      value={override?.altText ?? ''}
                    />
                  </label>
                  <label className={labelClass}>
                    Focal position
                    <select
                      className={inputClass}
                      onChange={(event) =>
                        setCategoryOverrides((current) =>
                          current.map((item) =>
                            item.categoryId === categoryId
                              ? {
                                  ...item,
                                  focalPoint: event.target
                                    .value as CategoryOverride['focalPoint'],
                                }
                              : item,
                          ),
                        )
                      }
                      value={override?.focalPoint ?? 'center'}
                    >
                      {['center', 'top', 'bottom', 'left', 'right'].map(
                        (value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <p className="col-span-full text-xs text-muted-foreground">
                    Resolved source:{' '}
                    {override
                      ? 'Homepage override'
                      : categoryImageSources[categoryId] === 'CATEGORY_COVER'
                        ? 'Category cover'
                        : categoryImageSources[categoryId] ===
                            'PRODUCT_FALLBACK'
                          ? 'Product fallback'
                          : 'Default fallback'}
                  </p>
                </fieldset>
              );
            })}
          </Section>
        ) : null}
        <Selection
          title="Featured products"
          items={products}
          selected={productIds}
          max={12}
          onChange={setProductIds}
        />
      </fieldset>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <HomepageEditorActions
          busy={busy}
          canEdit={canEdit}
          canPreview={canPreview}
          canPublish={canPublish}
          dirty={dirty}
          draftId={state.draft?.id ?? null}
          onPublish={() => setConfirmation({ kind: 'publish' })}
          onSave={() => void saveDraft()}
          verticalOnMobile
        />
      </section>

      {canPublish &&
      state.revisions.some((revision) => revision.kind === 'PUBLISHED') ? (
        <Section title="Publication history">
          <div className="col-span-full space-y-2">
            {state.revisions
              .filter((revision) => revision.kind === 'PUBLISHED')
              .map((revision) => (
                <div
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                  key={revision.id}
                >
                  <span className="text-sm">
                    Published version {revision.version}
                    {revision.publishedAt
                      ? ` · ${new Date(revision.publishedAt).toLocaleString()}`
                      : ''}
                  </span>
                  <button
                    className="inline-flex items-center gap-1 rounded border border-border px-3 py-1.5 text-xs"
                    disabled={busy || revision.id === state.published?.id}
                    onClick={() =>
                      setConfirmation({ kind: 'restore', id: revision.id })
                    }
                  >
                    <RotateCcw className="h-3 w-3" /> Restore
                  </button>
                </div>
              ))}
          </div>
        </Section>
      ) : null}
      <AccessibleDialog
        descriptionId="homepage-confirm-description"
        initialFocusRef={confirmButtonRef}
        onClose={() => setConfirmation(null)}
        open={confirmation !== null}
        titleId="homepage-confirm-title"
      >
        <div className="space-y-4 p-5">
          <h2 className="text-xl font-semibold" id="homepage-confirm-title">
            {confirmation?.kind === 'restore'
              ? 'Restore this publication?'
              : 'Publish this homepage draft?'}
          </h2>
          <p
            className="text-sm text-muted-foreground"
            id="homepage-confirm-description"
          >
            {confirmation?.kind === 'restore'
              ? 'The historical publication will become a new immutable published revision.'
              : 'The previous publication remains in history and can be restored later.'}
          </p>
          <div className="flex justify-end gap-2">
            <button
              className="min-h-11 rounded-lg border border-border px-4 text-sm"
              onClick={() => setConfirmation(null)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
              onClick={() => {
                const action = confirmation;
                setConfirmation(null);
                if (action?.kind === 'restore') void restore(action.id);
                else if (action?.kind === 'publish') void publish();
              }}
              ref={confirmButtonRef}
              type="button"
            >
              Confirm
            </button>
          </div>
        </div>
      </AccessibleDialog>
    </div>
  );
}

function GoogleReviewsStatusPanel({
  status,
  test,
  busy,
  onTest,
}: {
  status: GoogleReviewsAdminStatus | null;
  test: GoogleReviewsAdminTest | null;
  busy: boolean;
  onTest: () => void;
}) {
  const checks = status
    ? ([
        ['Live reviews', status.liveReviewsEnabled],
        ['Server API key', status.apiKeyConfigured],
        ['Business Place ID', status.placeIdConfigured],
        ['Read-reviews link', status.reviewsUrlConfigured],
        ['Write-review link', status.writeReviewUrlConfigured],
      ] as const)
    : [];
  return (
    <section
      aria-labelledby="google-reviews-status-heading"
      className="rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Server-only integration
          </p>
          <h2
            className="mt-1 text-lg font-semibold"
            id="google-reviews-status-heading"
          >
            Google Reviews connection
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Credentials stay in the API environment. Connection-test results are
            temporary and are not saved with homepage content.
          </p>
        </div>
        <button
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-semibold outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          disabled={busy || !status}
          onClick={onTest}
          type="button"
        >
          <RefreshCw
            aria-hidden="true"
            className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`}
          />
          {busy ? 'Testing…' : 'Test connection'}
        </button>
      </div>
      {status ? (
        <>
          <p className="mt-5 text-sm font-medium">
            Configuration status: {status.status.replaceAll('_', ' ')}
          </p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {checks.map(([label, configured]) => (
              <div className="rounded-lg bg-muted px-3 py-2" key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-sm font-semibold">
                  {configured ? 'Yes' : 'No'}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            {status.languageCode} · {status.regionCode} · {status.timeoutMs} ms
            timeout
          </p>
        </>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">
          Configuration status is unavailable.
        </p>
      )}
      {test ? (
        <div
          aria-live="polite"
          className="mt-5 rounded-xl border border-border bg-muted p-4"
        >
          <p className="font-semibold">{test.status.replaceAll('_', ' ')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{test.message}</p>
          {test.status === 'LIVE' ? (
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Business</dt>
                <dd>{test.businessName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Rating</dt>
                <dd>{test.rating}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Review count</dt>
                <dd>{test.reviewCount}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Reviews returned</dt>
                <dd>{test.reviewsReturned}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function HomepageEditorActions({
  busy,
  canEdit,
  canPreview,
  canPublish,
  dirty,
  draftId,
  onPublish,
  onSave,
  verticalOnMobile = false,
}: {
  busy: boolean;
  canEdit: boolean;
  canPreview: boolean;
  canPublish: boolean;
  dirty: boolean;
  draftId: string | null;
  onPublish: () => void;
  onSave: () => void;
  verticalOnMobile?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${verticalOnMobile ? 'max-sm:flex-col max-sm:items-stretch' : ''}`}
    >
      <span className="mr-1 text-xs text-muted-foreground">
        {dirty
          ? 'You have unpublished changes.'
          : draftId
            ? 'Draft saved.'
            : 'Published content.'}
      </span>
      {canPreview && draftId ? (
        <a
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm"
          href={`/website/homepage/preview/${draftId}`}
          rel="noreferrer"
          target="_blank"
        >
          Preview <ExternalLink className="h-4 w-4" />
        </a>
      ) : null}
      {canEdit ? (
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm disabled:opacity-50"
          disabled={busy || !dirty}
          onClick={onSave}
          type="button"
        >
          <Save className="h-4 w-4" /> Save draft
        </button>
      ) : null}
      {canPublish ? (
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50"
          disabled={busy || !draftId || dirty}
          onClick={onPublish}
          type="button"
        >
          <Send className="h-4 w-4" /> Publish
        </button>
      ) : null}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <h2 className="mb-4 text-lg font-semibold capitalize">{title}</h2>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}
function TextField({
  label,
  value,
  onChange,
  textarea = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  textarea?: boolean;
}) {
  return (
    <label className={labelClass}>
      {label}
      {textarea ? (
        <textarea
          className={`${controlClass} min-h-[104px] resize-y py-3`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className={inputClass}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function SectionDetails({
  section,
  content,
  setContent,
  canEdit,
  canManageMedia,
  currentMedia,
  onNotice,
  rememberMedia,
}: {
  section:
    | 'featuredCategories'
    | 'benefits'
    | 'featuredProducts'
    | 'process'
    | 'solutions'
    | 'reviews'
    | 'pickupDelivery'
    | 'serviceAreas';
  content: HomepageContent;
  setContent: Dispatch<SetStateAction<HomepageContent>>;
  canEdit: boolean;
  canManageMedia: boolean;
  currentMedia: (reference: string | null) => Media | null;
  onNotice: (message: string) => void;
  rememberMedia: (item: Media) => void;
}) {
  if (section === 'benefits') {
    return content.benefits.items.map((item, index) => (
      <ItemEditor
        key={`benefit-${index}`}
        label={`Benefit ${index + 1}`}
        title={item.title}
        description={item.description}
        icon={item.icon}
        enabled={item.enabled}
        onEnabled={(enabled) =>
          setContent((current) => ({
            ...current,
            benefits: {
              ...current.benefits,
              items: current.benefits.items.map((entry, itemIndex) =>
                itemIndex === index ? { ...entry, enabled } : entry,
              ),
            },
          }))
        }
        onIcon={(icon) =>
          setContent((current) => ({
            ...current,
            benefits: {
              ...current.benefits,
              items: current.benefits.items.map((entry, itemIndex) =>
                itemIndex === index ? { ...entry, icon } : entry,
              ),
            },
          }))
        }
        onTitle={(title) =>
          setContent((current) => ({
            ...current,
            benefits: {
              ...current.benefits,
              items: current.benefits.items.map((entry, itemIndex) =>
                itemIndex === index ? { ...entry, title } : entry,
              ),
            },
          }))
        }
        onDescription={(description) =>
          setContent((current) => ({
            ...current,
            benefits: {
              ...current.benefits,
              items: current.benefits.items.map((entry, itemIndex) =>
                itemIndex === index ? { ...entry, description } : entry,
              ),
            },
          }))
        }
      />
    ));
  }
  if (section === 'process') {
    return content.process.steps.map((item, index) => (
      <ItemEditor
        key={`step-${index}`}
        label={`Step ${index + 1}`}
        title={item.title}
        description={item.description}
        onTitle={(title) =>
          setContent((current) => ({
            ...current,
            process: {
              ...current.process,
              steps: current.process.steps.map((entry, itemIndex) =>
                itemIndex === index ? { ...entry, title } : entry,
              ),
            },
          }))
        }
        onDescription={(description) =>
          setContent((current) => ({
            ...current,
            process: {
              ...current.process,
              steps: current.process.steps.map((entry, itemIndex) =>
                itemIndex === index ? { ...entry, description } : entry,
              ),
            },
          }))
        }
      />
    ));
  }
  if (section === 'solutions') {
    return content.solutions.items.map((item, index) => (
      <fieldset
        className="grid gap-3 rounded-lg border border-border p-3"
        key={`solution-${index}`}
      >
        <legend className="px-1 text-sm font-medium">
          Solution {index + 1}
        </legend>
        <TextField
          label="Title"
          value={item.title}
          onChange={(title) =>
            setContent((current) => ({
              ...current,
              solutions: {
                ...current.solutions,
                items: current.solutions.items.map((entry, itemIndex) =>
                  itemIndex === index ? { ...entry, title } : entry,
                ),
              },
            }))
          }
        />
        <TextField
          label="Description"
          value={item.description}
          onChange={(description) =>
            setContent((current) => ({
              ...current,
              solutions: {
                ...current.solutions,
                items: current.solutions.items.map((entry, itemIndex) =>
                  itemIndex === index ? { ...entry, description } : entry,
                ),
              },
            }))
          }
          textarea
        />
        <TextField
          label="Destination path"
          value={item.href}
          onChange={(href) =>
            setContent((current) => ({
              ...current,
              solutions: {
                ...current.solutions,
                items: current.solutions.items.map((entry, itemIndex) =>
                  itemIndex === index ? { ...entry, href } : entry,
                ),
              },
            }))
          }
        />
        <MediaAssignmentField
          canEdit={canEdit}
          canUpload={canManageMedia}
          current={currentMedia(item.mediaId)}
          label={`${item.title || `Solution ${index + 1}`} image`}
          onNotice={onNotice}
          onRemove={() =>
            setContent((current) => ({
              ...current,
              solutions: {
                ...current.solutions,
                items: current.solutions.items.map((entry, itemIndex) =>
                  itemIndex === index ? { ...entry, mediaId: null } : entry,
                ),
              },
            }))
          }
          onSelect={(media) => {
            rememberMedia(media);
            setContent((current) => ({
              ...current,
              solutions: {
                ...current.solutions,
                items: current.solutions.items.map((entry, itemIndex) =>
                  itemIndex === index
                    ? { ...entry, mediaId: media.mediaRef }
                    : entry,
                ),
              },
            }));
          }}
        />
      </fieldset>
    ));
  }
  if (section === 'reviews') {
    return (
      <>
        <label className="flex items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            checked={content.reviews.enabled}
            onChange={(event) =>
              setContent((current) => ({
                ...current,
                reviews: {
                  ...current.reviews,
                  enabled: event.target.checked,
                },
              }))
            }
          />
          Show Google review links
        </label>
        <TextField
          label="Google reviews URL"
          value={content.reviews.reviewsUrl ?? ''}
          onChange={(reviewsUrl) =>
            setContent((current) => ({
              ...current,
              reviews: {
                ...current.reviews,
                reviewsUrl: reviewsUrl.trim() || null,
              },
            }))
          }
        />
        <TextField
          label="Google write-a-review URL"
          value={content.reviews.writeReviewUrl ?? ''}
          onChange={(writeReviewUrl) =>
            setContent((current) => ({
              ...current,
              reviews: {
                ...current.reviews,
                writeReviewUrl: writeReviewUrl.trim() || null,
              },
            }))
          }
        />
      </>
    );
  }
  if (section === 'pickupDelivery') {
    return (
      <>
        {(
          [
            ['pickupTitle', 'Pickup title', false],
            ['pickupDescription', 'Pickup description', true],
            ['deliveryTitle', 'Delivery title', false],
            ['deliveryDescription', 'Delivery description', true],
          ] as const
        ).map(([field, label, textarea]) => (
          <TextField
            key={field}
            label={label}
            value={content.pickupDelivery[field]}
            onChange={(value) =>
              setContent((current) => ({
                ...current,
                pickupDelivery: {
                  ...current.pickupDelivery,
                  [field]: value,
                },
              }))
            }
            textarea={textarea}
          />
        ))}
        <MediaAssignmentField
          canEdit={canEdit}
          canUpload={canManageMedia}
          current={currentMedia(content.pickupDelivery.mediaId)}
          label="Pickup and delivery"
          onNotice={onNotice}
          onRemove={() =>
            setContent((current) => ({
              ...current,
              pickupDelivery: { ...current.pickupDelivery, mediaId: null },
            }))
          }
          onSelect={(media) => {
            rememberMedia(media);
            setContent((current) => ({
              ...current,
              pickupDelivery: {
                ...current.pickupDelivery,
                mediaId: media.mediaRef,
              },
            }));
          }}
        />
      </>
    );
  }
  if (section === 'serviceAreas') {
    return (
      <TextField
        label="Service areas (one per line)"
        value={content.serviceAreas.areas.map((area) => area.label).join('\n')}
        onChange={(value) =>
          setContent((current) => ({
            ...current,
            serviceAreas: {
              ...current.serviceAreas,
              areas: value
                .split('\n')
                .map((area) => area.trim())
                .filter(Boolean)
                .slice(0, 20)
                .map((label, index) => ({
                  label,
                  enabled: current.serviceAreas.areas[index]?.enabled ?? true,
                })),
            },
          }))
        }
        textarea
      />
    );
  }
  return null;
}

function ItemEditor({
  label,
  title,
  description,
  onTitle,
  onDescription,
  icon,
  enabled,
  onIcon,
  onEnabled,
}: {
  label: string;
  title: string;
  description: string;
  onTitle: (value: string) => void;
  onDescription: (value: string) => void;
  icon?: (typeof HOMEPAGE_ICONS)[number];
  enabled?: boolean;
  onIcon?: (value: (typeof HOMEPAGE_ICONS)[number]) => void;
  onEnabled?: (value: boolean) => void;
}) {
  return (
    <fieldset className="grid gap-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <TextField label="Title" value={title} onChange={onTitle} />
      <TextField
        label="Description"
        value={description}
        onChange={onDescription}
        textarea
      />
      {icon && onIcon ? (
        <label className={labelClass}>
          Icon
          <select
            className={inputClass}
            value={icon}
            onChange={(event) =>
              onIcon(event.target.value as (typeof HOMEPAGE_ICONS)[number])
            }
          >
            {HOMEPAGE_ICONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {enabled !== undefined && onEnabled ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onEnabled(event.target.checked)}
          />
          Visible
        </label>
      ) : null}
    </fieldset>
  );
}

function Selection({
  title,
  items,
  selected,
  onChange,
  max,
}: {
  title: string;
  items: CatalogueItem[];
  selected: string[];
  onChange: (ids: string[]) => void;
  max: number;
}) {
  const [query, setQuery] = useState('');
  const visibleItems = items.filter((item) =>
    item.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose and order up to {max}. Only active public records can be
        published.
      </p>
      <label className={`${labelClass} mt-4 max-w-xl`}>
        Search {title.toLowerCase()}
        <input
          className={inputClass}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {selected.length ? (
        <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {selected.map((selectedId, index) => {
            const item = items.find((candidate) => candidate.id === selectedId);
            return item ? (
              <li
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm"
                key={selectedId}
              >
                <span>
                  {index + 1}. {item.name}
                </span>
                <span className="flex gap-1">
                  <button
                    className="rounded border border-border px-2 py-1 disabled:opacity-40"
                    disabled={index === 0}
                    type="button"
                    onClick={() =>
                      onChange(moveItem(selected, index, index - 1))
                    }
                  >
                    Earlier
                  </button>
                  <button
                    className="rounded border border-border px-2 py-1 disabled:opacity-40"
                    disabled={index === selected.length - 1}
                    type="button"
                    onClick={() =>
                      onChange(moveItem(selected, index, index + 1))
                    }
                  >
                    Later
                  </button>
                </span>
              </li>
            ) : null;
          })}
        </ol>
      ) : null}
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {visibleItems.map((item) => (
          <label
            className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm"
            key={item.id}
          >
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              disabled={!selected.includes(item.id) && selected.length >= max}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, item.id]
                    : selected.filter((id) => id !== item.id),
                )
              }
            />
            {item.name}
          </label>
        ))}
      </div>
    </section>
  );
}
