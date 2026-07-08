/**
 * Backlog & Sprints — a separate execution artifact (epics, tasks,
 * dependencies, sprint plan). Read-only; not part of the main PDF.
 * "Export to Qira" is not a live integration anywhere in the codebase, so
 * the only action here is downloading a Qira-ready Markdown draft.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../lib/auth';
import { packApi, ApiException, type QiraBacklogDraft, type QiraBacklogEpic } from '../../../lib/api';
import { shareTextAsFile } from '../../../lib/export';
import { impact } from '../../../lib/haptics';
import {
  tk, Card, Badge, Button, SectionHeader, SkeletonCard, EmptyState, ErrorState, Divider,
} from '../../../components/brand';

function buildBacklogMarkdown(backlog: QiraBacklogDraft): string {
  const lines: string[] = [
    `# ${backlog.projectTitle}`, '',
    '> Draft backlog for Qira or another delivery/PM system. Not a live API export.', '',
    backlog.projectDescription, '', '## Epics', '',
  ];
  for (const epic of backlog.epics) {
    lines.push(`### ${epic.title}`, '', epic.description, '', `- Priority: ${epic.priority}`, `- Sprint hint: ${epic.sprintHint}`, '', '#### Tasks', '');
    for (const task of epic.tasks) {
      lines.push(`- **${task.title}** (${task.ownerRole}, ${task.taskType}) — ${task.description}`);
      if (task.acceptanceCriteria.length) lines.push(`  - Acceptance: ${task.acceptanceCriteria.join('; ')}`);
    }
    lines.push('');
  }
  lines.push('## Sprints', '');
  for (const sprint of backlog.sprints) {
    lines.push(`### ${sprint.name}`, '', sprint.goal, `- Epics: ${sprint.epicTitles.join(', ')}`, `- Tasks: ${sprint.taskTitles.join(', ')}`, '');
  }
  return lines.join('\n');
}

function EpicCard({ epic }: { epic: QiraBacklogEpic }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Pressable onPress={() => { impact(); setExpanded((v) => !v); }} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: tk.color.ink, flex: 1, marginRight: 8 }}>{epic.title}</Text>
          <Badge variant="muted" size="sm">{epic.priority}</Badge>
        </View>
        <Text style={{ fontSize: 13, color: tk.color.subtle }}>{epic.description}</Text>
        <Text style={{ fontSize: 12, color: tk.color.muted }}>{epic.sprintHint} · {epic.tasks.length} tasks</Text>

        {expanded && (
          <>
            <Divider style={{ marginVertical: 4 }} />
            <View style={{ gap: 10 }}>
              {epic.tasks.map((task) => (
                <View key={task.title} style={{ gap: 3 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: tk.color.ink }}>{task.title}</Text>
                  <Text style={{ fontSize: 12, color: tk.color.subtle }}>{task.description}</Text>
                  <Text style={{ fontSize: 11, color: tk.color.muted }}>Owner: {task.ownerRole}</Text>
                  {task.acceptanceCriteria.length > 0 && (
                    <Text style={{ fontSize: 11, color: tk.color.muted }}>Acceptance: {task.acceptanceCriteria.join('; ')}</Text>
                  )}
                  {task.dependencies.length > 0 && (
                    <Text style={{ fontSize: 11, color: tk.color.muted }}>Depends on: {task.dependencies.join(', ')}</Text>
                  )}
                </View>
              ))}
            </View>
          </>
        )}
      </Card>
    </Pressable>
  );
}

export default function Backlog() {
  const { id, download } = useLocalSearchParams<{ id: string; download?: string }>();
  const { user } = useAuth();
  const wsId = user?.workspaces?.[0]?.id;

  const [backlog, setBacklog] = useState<QiraBacklogDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const autoDownloaded = useRef(false);

  const load = useCallback(async () => {
    if (!wsId || !id) { setLoading(false); return; }
    try {
      const pack = await packApi.get(wsId, id);
      setBacklog(pack.metadata?.executionHandoff?.qiraBacklogDraft ?? null);
    } catch (e) {
      setError(e instanceof ApiException ? e.message : 'Could not load the backlog.');
    } finally {
      setLoading(false);
    }
  }, [wsId, id]);

  useEffect(() => { load(); }, [load]);

  const doDownload = useCallback(async () => {
    if (!backlog) return;
    setDownloading(true);
    try {
      await shareTextAsFile(buildBacklogMarkdown(backlog), `${backlog.projectTitle.replace(/[^a-z0-9]+/gi, '-')}-backlog.md`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share the backlog.');
    } finally {
      setDownloading(false);
    }
  }, [backlog]);

  useEffect(() => {
    if (download === '1' && backlog && !autoDownloaded.current) {
      autoDownloaded.current = true;
      doDownload();
    }
  }, [download, backlog, doDownload]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tk.color.canvas }}
      contentContainerStyle={{ padding: tk.space.base, paddingBottom: 64, gap: tk.space.lg }}
      showsVerticalScrollIndicator={false}
    >
      {loading && <SkeletonCard />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}

      {!loading && !backlog && !error && (
        <EmptyState icon="🗂" title="Backlog not available" body="This pack doesn't have a backlog draft yet." />
      )}

      {!loading && backlog && (
        <>
          <View>
            <Text style={{ fontSize: 20, fontWeight: '800', color: tk.color.ink }}>{backlog.projectTitle}</Text>
            <Text style={{ fontSize: 14, color: tk.color.subtle, marginTop: 4 }}>{backlog.projectDescription}</Text>
          </View>

          <View>
            <SectionHeader title={`Epics (${backlog.epics.length})`} />
            <View style={{ gap: 8 }}>
              {backlog.epics.map((epic) => <EpicCard key={epic.title} epic={epic} />)}
            </View>
          </View>

          <View>
            <SectionHeader title={`Sprints (${backlog.sprints.length})`} />
            <View style={{ gap: 8 }}>
              {backlog.sprints.map((sprint) => (
                <Card key={sprint.name} style={{ gap: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: tk.color.ink }}>{sprint.name}</Text>
                  <Text style={{ fontSize: 13, color: tk.color.subtle }}>{sprint.goal}</Text>
                  <Text style={{ fontSize: 11, color: tk.color.muted }}>{sprint.taskTitles.length} tasks</Text>
                </Card>
              ))}
            </View>
          </View>

          <Button label="Download (Qira-ready .md)" onPress={doDownload} loading={downloading} />
        </>
      )}
    </ScrollView>
  );
}
