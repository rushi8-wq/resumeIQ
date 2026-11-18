import { DiscoveredJob } from './models/DiscoveredJob.js';
import { SavedJob } from './models/SavedJob.js';
import { JobRecommendation } from './models/JobRecommendation.js';
import { JobProviderState } from './models/JobProviderState.js';
import { AISuggestion } from './models/AISuggestion.js';
import { OptimizedResumeVersion } from './models/OptimizedResumeVersion.js';
import { AIUsage } from './models/AIUsage.js';
import mongoose from 'mongoose';
import pino from 'pino';
import { readEnv } from './config/env.js';
import { connectDatabase } from './config/database.js';
import { createApp } from './app.js';
import { JobDescription } from './models/JobDescription.js';
import { MatchAnalysis } from './models/MatchAnalysis.js';
import { User } from './models/User.js';
import { Resume } from './models/Resume.js';
import { Session } from './models/Session.js';
const log = pino();
try {
  const env = readEnv();
  await connectDatabase(env.MONGODB_URI);
  await Promise.all([
    DiscoveredJob.init(),
    SavedJob.init(),
    JobRecommendation.init(),
    JobProviderState.init(),
    User.init(),
    Session.init(),
    Resume.init(),
    JobDescription.init(),
    MatchAnalysis.init(),
    AISuggestion.init(),
    OptimizedResumeVersion.init(),
    AIUsage.init(),
  ]);
  const server = createApp(env).listen(env.PORT, () =>
    log.info({ port: env.PORT }, 'ResumeIQ API ready'),
  );
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    server.close(async () => {
      await mongoose.disconnect();
      clearTimeout(timeout);
      process.exit(0);
    });
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} catch (error) {
  log.error(
    { name: error.name },
    'Startup failed. Check environment and MongoDB connectivity.',
  );
  process.exit(1);
}
