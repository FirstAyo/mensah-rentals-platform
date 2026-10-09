'use client';

import type { ProductDescriptionDocument } from '@mensah-rentals/types';
import Link from '@tiptap/extension-link';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Redo2,
  Undo2,
} from 'lucide-react';

export function ProductDescriptionEditor({
  initialDocument,
  initialText,
  onChange,
}: {
  initialDocument: ProductDescriptionDocument | null;
  initialText: string;
  onChange: (document: ProductDescriptionDocument, plainText: string) => void;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({
        autolink: false,
        linkOnPaste: true,
        openOnClick: false,
        protocols: ['http', 'https', 'mailto', 'tel'],
        HTMLAttributes: { rel: 'noopener noreferrer' },
      }),
    ],
    content: initialDocument ?? {
      type: 'doc',
      content: initialText
        ? [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: initialText }],
            },
          ]
        : [{ type: 'paragraph' }],
    },
    editorProps: {
      attributes: {
        class:
          'min-h-56 rounded-b-xl px-4 py-3 text-sm leading-7 outline-none prose prose-sm max-w-none dark:prose-invert focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        'aria-label': 'Product description',
      },
      transformPastedHTML: (html) =>
        html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ''),
    },
    onUpdate: ({ editor: value }) =>
      onChange(
        value.getJSON() as ProductDescriptionDocument,
        value.getText({ blockSeparator: '\n\n' }).trim(),
      ),
  });

  if (!editor)
    return (
      <div className="min-h-56 rounded-xl border border-border bg-muted/30" />
    );
  const button =
    'grid h-9 w-9 place-items-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 data-[active=true]:bg-primary data-[active=true]:text-primary-foreground';
  const actions = [
    [
      'Paragraph',
      Pilcrow,
      () => editor.chain().focus().setParagraph().run(),
      editor.isActive('paragraph'),
    ],
    [
      'Heading 2',
      Heading2,
      () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      editor.isActive('heading', { level: 2 }),
    ],
    [
      'Heading 3',
      Heading3,
      () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      editor.isActive('heading', { level: 3 }),
    ],
    [
      'Bold',
      Bold,
      () => editor.chain().focus().toggleBold().run(),
      editor.isActive('bold'),
    ],
    [
      'Italic',
      Italic,
      () => editor.chain().focus().toggleItalic().run(),
      editor.isActive('italic'),
    ],
    [
      'Bulleted list',
      List,
      () => editor.chain().focus().toggleBulletList().run(),
      editor.isActive('bulletList'),
    ],
    [
      'Numbered list',
      ListOrdered,
      () => editor.chain().focus().toggleOrderedList().run(),
      editor.isActive('orderedList'),
    ],
    [
      'Blockquote',
      Quote,
      () => editor.chain().focus().toggleBlockquote().run(),
      editor.isActive('blockquote'),
    ],
  ] as const;
  const activeEditor = editor;

  function editLink() {
    const existing = activeEditor.getAttributes('link').href as
      | string
      | undefined;
    const href = window.prompt(
      'Link URL (https://, http://, mailto:, tel:, /path, or #anchor)',
      existing ?? 'https://',
    );
    if (href === null) return;
    if (!href.trim())
      return void activeEditor.chain().focus().unsetLink().run();
    if (!/^(https?:|mailto:|tel:|\/|#)/i.test(href.trim())) {
      window.alert(
        'Use a safe web, email, telephone, anchor, or site-relative link.',
      );
      return;
    }
    activeEditor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({
        href: href.trim(),
        target: '_blank',
        rel: 'noopener noreferrer',
      })
      .run();
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div
        aria-label="Description formatting"
        className="flex flex-wrap gap-1 border-b border-border bg-muted/35 p-2"
        role="toolbar"
      >
        {actions.map(([label, Icon, action, active]) => (
          <button
            aria-label={label}
            className={button}
            data-active={active}
            key={label}
            onClick={action}
            title={label}
            type="button"
          >
            <Icon aria-hidden="true" className="h-4 w-4" />
          </button>
        ))}
        <button
          aria-label="Edit link"
          className={button}
          data-active={editor.isActive('link')}
          onClick={editLink}
          title="Edit link"
          type="button"
        >
          <Link2 aria-hidden="true" className="h-4 w-4" />
        </button>
        <span aria-hidden="true" className="mx-1 w-px bg-border" />
        <button
          aria-label="Undo"
          className={button}
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
          type="button"
        >
          <Undo2 aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          aria-label="Redo"
          className={button}
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
          type="button"
        >
          <Redo2 aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
