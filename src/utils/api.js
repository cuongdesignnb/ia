import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 120000, // 120s — GPT Image 2 cần ~60-90s
  headers: { 'Content-Type': 'application/json' },
});

// Attach auth token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ia_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally — redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ia_token');
      window.dispatchEvent(new Event('auth:expired'));
    }
    return Promise.reject(err);
  }
);

// Posts (scoped by fb_page_id)
export const getPosts = (params) => api.get('/posts', { params });
export const getPost = (id) => api.get(`/posts/${id}`);
export const getPostStats = (params) => api.get('/posts/stats', { params });
export const createPost = (data) => {
  if (data instanceof FormData) {
    return api.post('/posts', data, { headers: { 'Content-Type': 'multipart/form-data' } });
  }
  return api.post('/posts', data);
};
export const updatePost = (id, data) => {
  if (data instanceof FormData) {
    return api.put(`/posts/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
  }
  return api.put(`/posts/${id}`, data);
};
export const deletePost = (id) => api.delete(`/posts/${id}`);
export const publishPost = (id) => api.post(`/posts/${id}/publish`);
export const publishDraft = (id) => api.post(`/posts/${id}/publish-draft`);
export const publishScheduled = (id, scheduled_time) => api.post(`/posts/${id}/publish-scheduled`, { scheduled_time });
export const retryPost = (id) => api.post(`/posts/${id}/retry`);
export const cancelPost = (id) => api.post(`/posts/${id}/cancel`);

// Styles
export const getStyles = () => api.get('/styles');

// AI
export const generateCaption = (data) => api.post('/ai/caption', data, { timeout: 60000 });
export const generateImage = (data) => api.post('/ai/image', data, { timeout: 300000 }); // 5 phút cho GPT Image 2
export const getAiProviders = () => api.get('/ai/providers');

// Facebook (legacy)
export const getFbStatus = () => api.get('/facebook/status');

// Health
export const healthCheck = () => api.get('/health');

// Auth
export const authLogin = (password) => api.post('/auth/login', { password });
export const authLogout = () => api.post('/auth/logout');
export const authVerify = () => api.get('/auth/verify');
export const authChangePassword = (current_password, new_password) =>
  api.post('/auth/change-password', { current_password, new_password });

// Settings
export const getSettings = () => api.get('/settings');
export const updateSettings = (settings) => api.put('/settings', { settings });
export const testAiConnection = () => api.post('/settings/test-ai');

// Facebook Pages (multi-page)
export const getFbPages = () => api.get('/fb-pages');
export const getFbPage = (id) => api.get(`/fb-pages/${id}`);
export const addFbPage = (data) => api.post('/fb-pages', data);
export const updateFbPage = (id, data) => api.put(`/fb-pages/${id}`, data);
export const deleteFbPage = (id) => api.delete(`/fb-pages/${id}`);
export const syncFbPage = (id) => api.post(`/fb-pages/${id}/sync`);
export const checkPageToken = (id) => api.post(`/fb-pages/${id}/check-token`);
export const checkAllTokens = () => api.post('/fb-pages/check-all-tokens');
export const exchangePageToken = (id, token) => api.post(`/fb-pages/${id}/exchange-token`, token ? { token } : {});

// Media Library
export const uploadMedia = (formData) => api.post('/media/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 });
export const getMediaFiles = (params) => api.get('/media/files', { params });
export const getMediaFile = (id) => api.get(`/media/files/${id}`);
export const updateMediaFile = (id, data) => api.put(`/media/files/${id}`, data);
export const deleteMediaFile = (id) => api.delete(`/media/files/${id}`);
export const getMediaFolders = () => api.get('/media/folders');
export const createMediaFolder = (data) => api.post('/media/folders', data);
export const updateMediaFolder = (id, data) => api.put(`/media/folders/${id}`, data);
export const deleteMediaFolder = (id) => api.delete(`/media/folders/${id}`);

// True Stories
export const createStoryJob = (data) => api.post('/true-stories/jobs', data, { timeout: 300000 });
export const getStoryJobs = (params) => api.get('/true-stories/jobs', { params });
export const getStoryJob = (id) => api.get(`/true-stories/jobs/${id}`);
export const retryStoryJob = (id) => api.post(`/true-stories/jobs/${id}/retry`);
export const getStories = (params) => api.get('/true-stories', { params });
export const getStory = (id) => api.get(`/true-stories/${id}`);

// Generated Posts (True Story drafts)
export const getGeneratedPosts = (params) => api.get('/generated-posts', { params });
export const getGeneratedPost = (id) => api.get(`/generated-posts/${id}`);
export const updateGeneratedPost = (id, data) => api.put(`/generated-posts/${id}`, data);
export const approveGeneratedPost = (id) => api.post(`/generated-posts/${id}/approve`);
export const rejectGeneratedPost = (id) => api.post(`/generated-posts/${id}/reject`);
export const publishGeneratedPost = (id) => api.post(`/generated-posts/${id}/publish`);
export const regeneratePost = (id) => api.post(`/generated-posts/${id}/regenerate`);
export const recomposeImage = (id, media_id) => api.post(`/generated-posts/${id}/recompose`, { media_id });

export default api;

