'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  IconLoader2,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconEdit,
  IconCircleCheck,
  IconCircleX,
} from '@tabler/icons-react';

import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { authClient } from '@/lib/auth-client';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  category: string;
  locale: string;
  tags: string[];
  priority: number;
  published: boolean;
  hasEmbedding: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FormState {
  id?: string;
  title: string;
  slug: string;
  content: string;
  category: string;
  locale: string;
  tags: string; // comma-separated for the form
  priority: number;
  published: boolean;
}

const CATEGORIES = [
  'general',
  'getting_started',
  'mobile',
  'account',
  'trading',
  'strategies',
  'troubleshooting',
  'faq',
];

const LOCALES = ['en', 'zh'];

const EMPTY_FORM: FormState = {
  title: '',
  slug: '',
  content: '',
  category: 'general',
  locale: 'en',
  tags: '',
  priority: 0,
  published: true,
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminHelpKbPage() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();

  const [isLoading, setIsLoading] = useState(true);
  const [articles, setArticles] = useState<Article[]>([]);
  const [filterLocale, setFilterLocale] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [search, setSearch] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (sessionPending) return;
    if (!session || (session.user as { role?: string }).role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [session, sessionPending, router]);

  // ── Load articles ───────────────────────────────────────────────────────────
  const loadArticles = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterLocale !== 'all') params.set('locale', filterLocale);
      if (filterCategory !== 'all') params.set('category', filterCategory);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/admin/help-kb?${params.toString()}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error || 'Failed to load articles');
        return;
      }
      const data = (await res.json()) as { articles: Article[] };
      setArticles(data.articles);
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Failed to load articles');
    } finally {
      setIsLoading(false);
    }
  }, [filterLocale, filterCategory, search]);

  useEffect(() => {
    if (!sessionPending && session) loadArticles();
  }, [sessionPending, session, loadArticles]);

  // ── Editor actions ──────────────────────────────────────────────────────────
  const openNewEditor = () => {
    setForm(EMPTY_FORM);
    setEditorOpen(true);
  };

  const openEditEditor = (article: Article) => {
    setForm({
      id: article.id,
      title: article.title,
      slug: article.slug,
      content: article.content,
      category: article.category,
      locale: article.locale,
      tags: (article.tags ?? []).join(', '),
      priority: article.priority,
      published: article.published,
    });
    setEditorOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.slug.trim() || !form.content.trim()) {
      toast.error('Title, slug, and content are required');
      return;
    }
    if (!/^[a-z0-9-]+$/.test(form.slug)) {
      toast.error('Slug must contain only lowercase letters, digits, and hyphens');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        slug: form.slug.trim(),
        content: form.content,
        category: form.category,
        locale: form.locale,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        priority: form.priority,
        published: form.published,
      };

      const res = form.id
        ? await fetch(`/api/admin/help-kb/${form.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/admin/help-kb', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error || 'Save failed');
        return;
      }

      toast.success(form.id ? 'Article updated' : 'Article created');
      setEditorOpen(false);
      await loadArticles();
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/help-kb/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error || 'Delete failed');
        return;
      }
      toast.success('Article deleted');
      await loadArticles();
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Delete failed');
    }
  };

  const [isSeeding, setIsSeeding] = useState(false);
  const handleSeedDefaults = async () => {
    if (
      !confirm(
        'Load the built-in starter articles? Existing articles with the same slug will be overwritten.',
      )
    ) {
      return;
    }
    setIsSeeding(true);
    try {
      const res = await fetch('/api/admin/help-kb/seed-defaults', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as {
        total?: number;
        upserted?: number;
        embedded?: number;
        pending?: number;
        error?: string;
      };
      if (!res.ok) {
        toast.error(body.error || 'Seed failed');
        return;
      }
      toast.success(
        `Seeded ${body.upserted ?? 0} of ${body.total ?? 0} articles` +
          (body.pending ? ` · ${body.pending} pending embedding` : ''),
      );
      await loadArticles();
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Seed failed');
    } finally {
      setIsSeeding(false);
    }
  };

  const [isEmbeddingPending, setIsEmbeddingPending] = useState(false);
  const handleEmbedPending = async () => {
    setIsEmbeddingPending(true);
    try {
      const res = await fetch('/api/admin/help-kb/embed-pending', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as {
        total?: number;
        embedded?: number;
        failed?: number;
        error?: string;
      };
      if (!res.ok) {
        toast.error(body.error || 'Embed-pending failed');
        return;
      }
      if ((body.total ?? 0) === 0) {
        toast.success('Nothing to embed — every article already has a vector.');
      } else if ((body.failed ?? 0) > 0) {
        toast.warning(
          `Embedded ${body.embedded ?? 0} of ${body.total ?? 0} (${body.failed} failed)`,
        );
      } else {
        toast.success(`Embedded ${body.embedded ?? 0} articles`);
      }
      await loadArticles();
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Embed-pending failed');
    } finally {
      setIsEmbeddingPending(false);
    }
  };

  const handleReembed = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/help-kb/${id}/reembed`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error || 'Re-embed failed');
        return;
      }
      toast.success('Embedding regenerated');
      await loadArticles();
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Re-embed failed');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (sessionPending || !session) {
    return (
      <SidebarInset>
        <SiteHeader title="Help Knowledge Base" />
        <div className="flex h-64 items-center justify-center">
          <IconLoader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </SidebarInset>
    );
  }

  return (
    <SidebarInset>
      <SiteHeader title="Help Knowledge Base" />
      <div className="flex flex-col gap-4 px-4 py-6 lg:px-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Help Knowledge Base</CardTitle>
                <CardDescription>
                  Articles here power the public help bot on the landing page. Edits are
                  re-embedded automatically.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleSeedDefaults}
                  disabled={isSeeding}
                  title="Insert the built-in starter articles (idempotent)"
                >
                  {isSeeding && <IconLoader2 className="mr-1.5 size-4 animate-spin" />}
                  Load defaults
                </Button>
                <Button
                  variant="outline"
                  onClick={handleEmbedPending}
                  disabled={isEmbeddingPending}
                  title="Generate embeddings for any article whose vector is NULL"
                >
                  {isEmbeddingPending && (
                    <IconLoader2 className="mr-1.5 size-4 animate-spin" />
                  )}
                  Re-embed pending
                </Button>
                <Button onClick={openNewEditor}>
                  <IconPlus className="mr-1.5 size-4" />
                  New article
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[180px]">
                <Label className="text-xs text-muted-foreground">Search</Label>
                <Input
                  placeholder="Title, slug, or content…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadArticles()}
                />
              </div>
              <div className="min-w-[140px]">
                <Label className="text-xs text-muted-foreground">Locale</Label>
                <Select value={filterLocale} onValueChange={setFilterLocale}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All locales</SelectItem>
                    {LOCALES.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[180px]">
                <Label className="text-xs text-muted-foreground">Category</Label>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={loadArticles}>
                  <IconRefresh className="mr-1.5 size-4" />
                  Refresh
                </Button>
              </div>
            </div>

            {/* Table */}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Locale</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center">
                        <IconLoader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : articles.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        No articles yet. Click <strong>New article</strong> to add one.
                      </TableCell>
                    </TableRow>
                  ) : (
                    articles.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.title}</TableCell>
                        <TableCell>
                          <code className="text-xs text-muted-foreground">{a.slug}</code>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{a.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{a.locale}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 text-xs">
                            <span className="flex items-center gap-1">
                              {a.published ? (
                                <IconCircleCheck className="size-3.5 text-emerald-500" />
                              ) : (
                                <IconCircleX className="size-3.5 text-muted-foreground" />
                              )}
                              {a.published ? 'Published' : 'Draft'}
                            </span>
                            <span
                              className={
                                a.hasEmbedding
                                  ? 'text-muted-foreground'
                                  : 'text-amber-500'
                              }
                            >
                              {a.hasEmbedding ? 'Embedded' : 'No embedding'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReembed(a.id)}
                              title="Regenerate embedding"
                            >
                              <IconRefresh className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditEditor(a)}
                              title="Edit"
                            >
                              <IconEdit className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(a.id, a.title)}
                              title="Delete"
                              className="text-destructive hover:text-destructive"
                            >
                              <IconTrash className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Editor dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit article' : 'New article'}</DialogTitle>
            <DialogDescription>
              Articles are auto-embedded on save. Use Markdown for formatting.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="How to install the mobile app on Android"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  value={form.slug}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                    }))
                  }
                  placeholder="mobile-install-android"
                />
              </div>
              <div className="grid gap-2">
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Locale</Label>
                <Select
                  value={form.locale}
                  onValueChange={(v) => setForm((f) => ({ ...f, locale: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCALES.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="priority">Priority</Label>
                <Input
                  id="priority"
                  type="number"
                  value={form.priority}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, priority: Number(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder="android, apk, mobile"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="content">Content (Markdown)</Label>
              <Textarea
                id="content"
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                rows={12}
                className="font-mono text-sm"
                placeholder="## Steps\n\n1. Open the app store…"
              />
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <Label htmlFor="published" className="text-sm font-medium">
                  Published
                </Label>
                <p className="text-xs text-muted-foreground">
                  Unpublished articles are not surfaced by the help bot.
                </p>
              </div>
              <Switch
                id="published"
                checked={form.published}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, published: checked }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditorOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <IconLoader2 className="mr-1.5 size-4 animate-spin" />}
              {form.id ? 'Save changes' : 'Create article'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarInset>
  );
}
