import Style from './Style.js';
import Post from './Post.js';
import Setting from './Setting.js';
import FbPage from './FbPage.js';
import MediaFolder from './MediaFolder.js';
import MediaFile from './MediaFile.js';
import TrueStory from './TrueStory.js';
import ContentJob from './ContentJob.js';
import GeneratedPost from './GeneratedPost.js';
import GeneratedImage from './GeneratedImage.js';

// ============================
// Original Associations
// ============================
Style.hasMany(Post, { foreignKey: 'style_id', as: 'posts' });
Post.belongsTo(Style, { foreignKey: 'style_id', as: 'style' });

FbPage.hasMany(Post, { foreignKey: 'fb_page_id', as: 'posts' });
Post.belongsTo(FbPage, { foreignKey: 'fb_page_id', as: 'fbPage' });

// ============================
// Media Library Associations
// ============================
MediaFolder.hasMany(MediaFolder, { foreignKey: 'parent_id', as: 'children' });
MediaFolder.belongsTo(MediaFolder, { foreignKey: 'parent_id', as: 'parent' });

MediaFolder.hasMany(MediaFile, { foreignKey: 'folder_id', as: 'files' });
MediaFile.belongsTo(MediaFolder, { foreignKey: 'folder_id', as: 'folder' });

// ============================
// True Story Associations
// ============================

// TrueStory ↔ MediaFile (ảnh tư liệu tìm được)
TrueStory.hasMany(MediaFile, { foreignKey: 'story_id', as: 'mediaFiles', constraints: false });

// TrueStory ↔ ContentJob
TrueStory.hasMany(ContentJob, { foreignKey: 'story_id', as: 'jobs' });
ContentJob.belongsTo(TrueStory, { foreignKey: 'story_id', as: 'story' });

// TrueStory ↔ GeneratedPost
TrueStory.hasMany(GeneratedPost, { foreignKey: 'story_id', as: 'generatedPosts' });
GeneratedPost.belongsTo(TrueStory, { foreignKey: 'story_id', as: 'story' });

// GeneratedPost ↔ ContentJob
ContentJob.hasOne(GeneratedPost, { foreignKey: 'content_job_id', as: 'generatedPost' });
GeneratedPost.belongsTo(ContentJob, { foreignKey: 'content_job_id', as: 'contentJob' });

// GeneratedPost ↔ FbPage
FbPage.hasMany(GeneratedPost, { foreignKey: 'fb_page_id', as: 'generatedPosts' });
GeneratedPost.belongsTo(FbPage, { foreignKey: 'fb_page_id', as: 'fbPage' });

// GeneratedPost ↔ MediaFile (ảnh final đã compose)
GeneratedPost.belongsTo(MediaFile, { foreignKey: 'final_image_id', as: 'finalImage' });

// GeneratedPost ↔ Post (bài đã publish)
GeneratedPost.belongsTo(Post, { foreignKey: 'published_post_id', as: 'publishedPost' });

// GeneratedImage ↔ TrueStory
TrueStory.hasMany(GeneratedImage, { foreignKey: 'story_id', as: 'generatedImages' });
GeneratedImage.belongsTo(TrueStory, { foreignKey: 'story_id', as: 'story' });

// GeneratedImage ↔ GeneratedPost
GeneratedPost.hasMany(GeneratedImage, { foreignKey: 'generated_post_id', as: 'generatedImages' });
GeneratedImage.belongsTo(GeneratedPost, { foreignKey: 'generated_post_id', as: 'generatedPost' });

// GeneratedImage ↔ MediaFile (source + output)
GeneratedImage.belongsTo(MediaFile, { foreignKey: 'source_media_id', as: 'sourceMedia' });
GeneratedImage.belongsTo(MediaFile, { foreignKey: 'output_media_id', as: 'outputMedia' });

export {
  Style, Post, Setting, FbPage,
  MediaFolder, MediaFile,
  TrueStory, ContentJob, GeneratedPost, GeneratedImage,
};

export default {
  Style, Post, Setting, FbPage,
  MediaFolder, MediaFile,
  TrueStory, ContentJob, GeneratedPost, GeneratedImage,
};
