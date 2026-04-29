import { Style } from '../models/index.js';

const seedStyles = async () => {
  const styles = [
    // --- TIN TỨC / BÁO CHÍ ---
    {
      name: 'Tin nóng / Breaking',
      slug: 'breaking-news',
      description: 'Tin tức nóng hổi, tốc độ, giật gân',
      prompt_template: 'Viết caption Facebook dạng tin nóng, khẩn cấp cho chủ đề: {{product}}. Yêu cầu: giọng khẩn trương, giật tít mạnh, dùng emoji 🚨🔥, tạo cảm giác "phải đọc ngay", kèm hashtag trending. Giọng điệu: {{tone}}. Viết bằng tiếng Việt.',
      image_prompt_template: 'Dramatic breaking news editorial image about {{product}}, dark cinematic background, bold red and white text overlay, urgent photojournalistic style, 4k',
      tone: 'urgent',
      icon: '🚨',
      color: '#ef4444',
      is_active: true,
      sort_order: 1,
    },
    {
      name: 'Giật tít / Clickbait',
      slug: 'clickbait',
      description: 'Tiêu đề gây sốc, thu hút click tối đa',
      prompt_template: 'Viết caption Facebook kiểu giật tít giật gân cho chủ đề: {{product}}. Yêu cầu: câu mở đầu gây tò mò cực mạnh kiểu "KHÔNG THỂ TIN NỔI", dùng số liệu shock, emoji 😱⚡🔥, tạo hiệu ứng FOMO, kèm hashtag viral. Giọng điệu: {{tone}}. Viết bằng tiếng Việt.',
      image_prompt_template: 'Sensational viral news thumbnail about {{product}}, bold headline text, dark gradient overlay, shocked expressions, red highlights, maximum clickbait impact, 4k',
      tone: 'sensational',
      icon: '⚡',
      color: '#f59e0b',
      is_active: true,
      sort_order: 2,
    },
    {
      name: 'Phóng sự Điều tra',
      slug: 'investigation',
      description: 'Điều tra chuyên sâu, phơi bày sự thật',
      prompt_template: 'Viết caption Facebook dạng phóng sự điều tra về chủ đề: {{product}}. Yêu cầu: giọng nghiêm túc, đặt câu hỏi "Ai đứng sau?", "Sự thật là gì?", trình bày bằng chứng, tạo kịch tính, kèm hashtag phù hợp. Giọng điệu: {{tone}}. Viết bằng tiếng Việt.',
      image_prompt_template: 'Investigative journalism cover about {{product}}, dark moody noir style, spotlight, magnifying glass, scattered documents, dramatic lighting, 4k',
      tone: 'investigative',
      icon: '🔍',
      color: '#6366f1',
      is_active: true,
      sort_order: 3,
    },
    {
      name: 'Tin Công nghệ',
      slug: 'tech-news',
      description: 'Tin tức công nghệ, AI, startup',
      prompt_template: 'Viết caption Facebook về tin tức công nghệ: {{product}}. Yêu cầu: giải thích dễ hiểu cho đại chúng, nhấn mạnh tác động tới cuộc sống, so sánh với đối thủ nếu có, dùng emoji 💻🤖📱, kèm hashtag tech. Giọng điệu: {{tone}}. Viết bằng tiếng Việt.',
      image_prompt_template: 'Sleek technology news cover about {{product}}, futuristic dark blue/purple gradient, holographic elements, neon accents, tech editorial design, 4k',
      tone: 'informative',
      icon: '💻',
      color: '#8b5cf6',
      is_active: true,
      sort_order: 4,
    },
    {
      name: 'Infographic / Số liệu',
      slug: 'infographic',
      description: 'Tổng hợp số liệu, biểu đồ, thống kê',
      prompt_template: 'Viết caption Facebook dạng tổng hợp số liệu cho chủ đề: {{product}}. Yêu cầu: liệt kê 5-7 con số ấn tượng, dùng bullet points, emoji 📊📈🔢, tạo cảm giác "data-driven", kết luận bất ngờ ở cuối, kèm hashtag. Giọng điệu: {{tone}}. Viết bằng tiếng Việt.',
      image_prompt_template: 'Data-driven statistics graphic about {{product}}, dark background, glowing charts, bar graphs, large bold percentage numbers, Vietnamese labels, Bloomberg style, 4k',
      tone: 'analytical',
      icon: '📊',
      color: '#10b981',
      is_active: true,
      sort_order: 5,
    },
    // --- PHONG CÁCH CHUNG ---
    {
      name: 'Chuyên nghiệp',
      slug: 'professional',
      description: 'Phong cách chuyên nghiệp, lịch sự cho thương hiệu',
      prompt_template: 'Viết caption Facebook chuyên nghiệp cho sản phẩm: {{product}}. Yêu cầu: ngôn ngữ thương mại, ấn tượng, kèm hashtag phù hợp. Giọng điệu: {{tone}}. Viết bằng tiếng Việt.',
      image_prompt_template: 'Professional product photography of {{product}}, clean white background, studio lighting, commercial style, 4k quality',
      tone: 'professional',
      color: '#64748b',
      is_active: true,
      sort_order: 6,
    },
    {
      name: 'Khuyến mãi',
      slug: 'promotional',
      description: 'Phong cách khuyến mãi, giảm giá, sale',
      prompt_template: 'Viết caption Facebook quảng cáo khuyến mãi cho sản phẩm: {{product}}. Yêu cầu: nhấn mạnh giá trị, tạo cảm giác khẩn cấp, kèm hashtag phù hợp. Giọng điệu: {{tone}}. Viết bằng tiếng Việt.',
      image_prompt_template: 'Eye-catching sale promotion banner for {{product}}, bold text overlay, red and gold colors, urgency design, modern layout',
      tone: 'urgent',
      color: '#ef4444',
      is_active: true,
      sort_order: 7,
    },
  ];

  for (const style of styles) {
    await Style.findOrCreate({ where: { slug: style.slug }, defaults: style });
  }
  console.log('Styles seeded successfully');
};

export default seedStyles;
