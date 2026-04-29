import cron from 'node-cron';
import { Post, Style, FbPage } from '../models/index.js';
import { publishToPage, publishPost } from './facebookService.js';
import { getSetting } from './settingsService.js';
import { Op } from 'sequelize';

let cronJob = null;
let storyJob = null;
let topicSuggestionJob = null;

/**
 * Start the scheduler - checks every minute for posts to publish
 * Supports multi-page: each post publishes to its assigned page
 */
export function startScheduler() {
  if (cronJob) cronJob.stop();

  cronJob = cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const pendingPosts = await Post.findAll({
        where: {
          status: 'scheduled',
          scheduled_at: { [Op.lte]: now },
        },
        include: [
          { model: Style, as: 'style' },
          { model: FbPage, as: 'fbPage' },
        ],
      });

      for (const post of pendingPosts) {
        try {
          await post.update({ status: 'publishing' });

          let result;
          if (post.fbPage && post.fbPage.is_active) {
            // Multi-page mode: publish to the assigned page
            result = await publishToPage({
              caption: post.caption,
              imageUrl: post.image_url,
              pageId: post.fbPage.page_id,
              accessToken: post.fbPage.access_token,
            });
          } else if (!post.fb_page_id) {
            // Legacy mode: use global settings
            result = await publishPost({
              caption: post.caption,
              imageUrl: post.image_url,
            });
          } else {
            throw new Error('Page đã bị tắt hoặc không tồn tại');
          }

          await post.update({
            status: 'published',
            published_at: new Date(),
            fb_post_id: result.fb_post_id,
          });
          console.log(`Đã đăng bài #${post.id}: "${post.title}" → ${post.fbPage?.name || 'Global'}`);
        } catch (err) {
          await post.update({
            status: 'failed',
            error_message: err.message,
          });
          console.error(`Lỗi đăng bài #${post.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('Scheduler error:', err.message);
    }
  });

  console.log('Post scheduler started (checking every minute)');
}

/**
 * Start the auto story scheduler
 * Reads cron expression from settings
 */
export async function startStoryScheduler() {
  if (storyJob) { storyJob.stop(); storyJob = null; }

  const enabled = await getSetting('auto_story_enabled');
  if (enabled !== 'true') {
    console.log('Auto story scheduler: disabled');
    return;
  }

  const cronExpr = await getSetting('auto_story_cron') || '0 6 * * *';
  if (!cron.validate(cronExpr)) {
    console.error(`Invalid cron expression: ${cronExpr}`);
    return;
  }

  storyJob = cron.schedule(cronExpr, async () => {
    console.log('[AutoStory] ⏰ Running scheduled story generation...');
    try {
      // Dynamic import to avoid circular dependency
      const { runPipeline } = await import('./contentPipelineService.js');
      const count = parseInt(await getSetting('auto_stories_per_day') || '3');

      for (let i = 0; i < count; i++) {
        try {
          console.log(`[AutoStory] Generating story ${i + 1}/${count}...`);
          await runPipeline();
          // Small delay between stories to avoid rate limits
          if (i < count - 1) await new Promise(r => setTimeout(r, 10000));
        } catch (err) {
          console.error(`[AutoStory] Story ${i + 1} failed:`, err.message);
        }
      }

      console.log(`[AutoStory] ✅ Completed generating ${count} stories`);
    } catch (err) {
      console.error('[AutoStory] Scheduler error:', err.message);
    }
  });

  console.log(`Auto story scheduler started (cron: ${cronExpr})`);
}

/**
 * Restart story scheduler (call after settings change)
 */
export async function restartStoryScheduler() {
  await startStoryScheduler();
}

/**
 * Start the topic suggestion scheduler — sinh kho gợi ý chủ đề mỗi ngày.
 * Cron mặc định: 06:00 (giờ server). Có thể đổi qua setting `topic_suggestion_cron`.
 */
export async function startTopicSuggestionScheduler() {
  if (topicSuggestionJob) { topicSuggestionJob.stop(); topicSuggestionJob = null; }

  const enabled = await getSetting('topic_suggestion_enabled');
  // Mặc định BẬT — kho tích luỹ phải có data hằng ngày
  if (enabled === 'false') {
    console.log('Topic suggestion scheduler: disabled');
    return;
  }

  const cronExpr = await getSetting('topic_suggestion_cron') || '0 6 * * *';
  if (!cron.validate(cronExpr)) {
    console.error(`Invalid topic suggestion cron expression: ${cronExpr}`);
    return;
  }

  topicSuggestionJob = cron.schedule(cronExpr, async () => {
    console.log('[TopicSuggestion] ⏰ Generating daily batch...');
    try {
      const { generateBatch } = await import('./topicSuggestionService.js');
      const result = await generateBatch({ source: 'cron' });
      console.log(`[TopicSuggestion] ✅ Created batch ${result.batch_id} with ${result.suggestions.length} topics`);
    } catch (err) {
      console.error('[TopicSuggestion] Scheduler error:', err.message);
    }
  });

  console.log(`Topic suggestion scheduler started (cron: ${cronExpr})`);
}

export async function restartTopicSuggestionScheduler() {
  await startTopicSuggestionScheduler();
}

export function stopScheduler() {
  if (cronJob) { cronJob.stop(); cronJob = null; }
  if (storyJob) { storyJob.stop(); storyJob = null; }
  if (topicSuggestionJob) { topicSuggestionJob.stop(); topicSuggestionJob = null; }
}

export default {
  startScheduler,
  startStoryScheduler,
  restartStoryScheduler,
  startTopicSuggestionScheduler,
  restartTopicSuggestionScheduler,
  stopScheduler,
};
