import { DiscoveredJob } from '../../models/DiscoveredJob.js';
import { JobProviderState } from '../../models/JobProviderState.js';
export const SYNC_INTERVAL = 60 * 60 * 1000;
export function createCatalog(provider) {
  let inFlight;
  async function sync() {
    const now = new Date();
    await JobProviderState.updateOne(
      { source: provider.name },
      { $setOnInsert: { nextFetchAt: new Date(0) } },
      { upsert: true },
    ).catch((e) => {
      if (e.code !== 11000) throw e;
    });
    const lease = await JobProviderState.findOneAndUpdate(
      { source: provider.name, nextFetchAt: { $lte: now } },
      { $set: { nextFetchAt: new Date(+now + SYNC_INTERVAL) } },
      { new: true },
    );
    if (!lease) return { live: false };
    try {
      const response = await provider.searchJobs({});
      const ids = new Set(),
        urls = new Set();
      for (const job of response.jobs) {
        if (ids.has(job.externalId) || urls.has(job.applicationUrl)) continue;
        ids.add(job.externalId);
        urls.add(job.applicationUrl);
        try {
          await DiscoveredJob.updateOne(
            { source: job.source, externalId: job.externalId },
            {
              $set: {
                ...job,
                fetchedAt: now,
                expiresAt: new Date(+now + 7 * 86400000),
              },
              $setOnInsert: { lastVerifiedAt: null },
            },
            { upsert: true, runValidators: true },
          );
        } catch (e) {
          if (e.code !== 11000) throw e;
        }
      }
      await JobProviderState.updateOne(
        { source: provider.name },
        {
          $set: {
            fetchedAt: now,
            hasMore: response.hasMore || false,
            skipped: response.skipped || 0,
          },
          $unset: { failedAt: 1 },
        },
      );
      return { live: true };
    } catch {
      await JobProviderState.updateOne(
        { source: provider.name },
        { $set: { failedAt: new Date() } },
      );
      return { live: false };
    }
  }
  async function status(live = false) {
    const state = await JobProviderState.findOne({
      source: provider.name,
    }).lean();
    const count = await DiscoveredJob.countDocuments({
      source: provider.name,
      expiresAt: { $gt: new Date() },
    });
    return {
      ...provider.getSourceStatus(),
      state:
        state?.failedAt ||
        !state?.fetchedAt ||
        Date.now() - +state.fetchedAt > SYNC_INTERVAL
          ? count
            ? 'stale'
            : 'unavailable'
          : live
            ? 'live'
            : 'cached',
      fetchedAt: state?.fetchedAt || null,
      nextFetchAt: state?.nextFetchAt || null,
      failedAt: state?.failedAt || null,
      partialCoverage: state?.hasMore || false,
      availableJobs: count,
      lastVerifiedAt: null,
    };
  }
  return {
    status,
    async refresh() {
      if (inFlight) {
        await inFlight;
        return status();
      }
      inFlight = sync();
      let result;
      try {
        result = await inFlight;
      } finally {
        inFlight = null;
      }
      return status(result.live);
    },
  };
}
