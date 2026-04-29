import cron from 'node-cron';
import { Post, Style, FbPage } from '../models/index.js';
import { publishToPage, publishPost } from './facebookService.js';
import { Op } from 'sequelize';

let cronJob = null;

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

export function stopScheduler() {
  if (cronJob) { cronJob.stop(); cronJob = null; }
}

export default { startScheduler, stopScheduler };
