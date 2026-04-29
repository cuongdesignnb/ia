import Style from './Style.js';
import Post from './Post.js';
import Setting from './Setting.js';
import FbPage from './FbPage.js';

// Associations
Style.hasMany(Post, { foreignKey: 'style_id', as: 'posts' });
Post.belongsTo(Style, { foreignKey: 'style_id', as: 'style' });

// Post belongs to a specific Facebook Page
FbPage.hasMany(Post, { foreignKey: 'fb_page_id', as: 'posts' });
Post.belongsTo(FbPage, { foreignKey: 'fb_page_id', as: 'fbPage' });

export { Style, Post, Setting, FbPage };
export default { Style, Post, Setting, FbPage };
