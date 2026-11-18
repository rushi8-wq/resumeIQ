import { useEffect, useState } from 'react';
import { api, mutate, errorMessage } from '../lib/api';
export function useOptimization(id) {
  const [data, setData] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [config, setConfig] = useState(null);
  const [versions, setVersions] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(null);
  const [reload, setReload] = useState(0);
  const [consent, setConsent] = useState(false);
  const [embeddingConsent, setEmbeddingConsent] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      api.get(`/match/${id}`),
      api.get(`/ai/suggestions/${id}`),
      api.get('/ai/config', { timeout: 40000 }),
    ])
      .then(async ([a, s, c]) => {
        const v = await api.get(`/ai/versions/${a.data.analysis.resumeId}`, {
          params: { page, limit: 10 },
        });
        if (active) {
          setData(a.data);
          setSuggestions(s.data.suggestions);
          setConfig(c.data);
          setVersions(v.data.versions);
          setPagination(v.data.pagination);
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, reload, page]);
  async function action(fn, { refresh = true, clearPreview = true } = {}) {
    setBusy(true);
    setError('');
    setMessage('');
    if (clearPreview) setPreview(null);
    try {
      await fn();
      if (refresh) setReload((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function generate(target) {
    return action(async () => {
      const response = await mutate(
        target ? '/ai/optimize' : '/ai/suggestions',
        { analysisId: id, consent, ...target },
        { timeout: 60000 },
      );
      setConsent(false);
      setMessage(
        response.data.suggestions.length
          ? 'Suggestions generated. Review every claim before accepting.'
          : 'Groq found no safe suggestions for this resume and job. No changes were made. You can review the saved resume or choose a specific bullet.',
      );
    });
  }
  function decide(s, decision) {
    return action(async () => {
      await mutate(`/ai/suggestions/${s.id}`, decision, { method: 'patch' });
      setMessage('Decision saved. Recalculate to review its effect.');
    });
  }
  const accepted = suggestions
    .filter((s) => s.status === 'accepted')
    .map((s) => s.id);
  function compare(save = false) {
    return action(
      async () => {
        const { data: result } = await mutate(
          '/ai/recalculate',
          {
            analysisId: id,
            suggestionIds: accepted,
            save,
            embeddingConsent,
            ...(save ? { previewHash: preview.previewHash } : {}),
          },
          { timeout: 45000 },
        );
        if (save)
          setMessage(
            'Optimized version saved. Your original resume is unchanged.',
          );
        else setPreview(result.preview);
      },
      { refresh: save, clearPreview: false },
    );
  }
  function deleteSuggestion(s) {
    return action(async () => {
      await mutate(`/ai/suggestions/${s.id}`, undefined, { method: 'delete' });
      setMessage(
        'Suggestion deleted. Previously saved versions remain in version history.',
      );
    });
  }
  function deleteVersion(v) {
    return action(
      async () => {
        await mutate(`/ai/versions/${v.id}`, undefined, { method: 'delete' });
        setMessage('Optimized version deleted.');
      },
      { clearPreview: false },
    );
  }
  return {
    data,
    suggestions,
    config,
    versions,
    pagination,
    page,
    setPage,
    loading,
    busy,
    error,
    message,
    preview,
    reload: () => setReload((n) => n + 1),
    consent,
    setConsent,
    embeddingConsent,
    setEmbeddingConsent,
    generate,
    decide,
    compare,
    deleteSuggestion,
    deleteVersion,
    accepted,
  };
}
