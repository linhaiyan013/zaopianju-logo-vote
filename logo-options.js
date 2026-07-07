window.LOGO_VOTE_CONFIG = {
  pollId: "zaopianju-logo-2026",
  // local = 只保存在当前浏览器；supabase = 云端实时同步。
  mode: "supabase",
  apiBaseUrl: "",
  title: "造片局 Logo 投票",
  subtitle: "帮我们选出最适合 AI 摄影小程序的 Logo",
  intro:
    "我们正在为『造片局』选择最终 Logo。它未来会用于小程序头像、首页、课程、作品展示和品牌传播。请你根据第一眼感受，选出你觉得最有记忆点、最适合 AI 摄影平台的那一个。",
  meaning:
    "我们希望这个 Logo 能代表「AI 生成影像」和「照片创作」的结合，也能承载 AI 写真、修图、课程、作品展示和视觉变现平台的长期品牌感。",
  footerNote: "没有标准答案，第一眼喜欢哪个就选哪个～",
  initialVotes: {},
  // 想增加或减少投票入口，直接增删 options 里的方案即可。每个 id 必须唯一。
  options: [
    {
      id: "optionA",
      name: "方案 A",
      image: "./assets/logos/logo-a.svg",
      keywords: ["简洁", "年轻", "AI 摄影感"],
    },
    {
      id: "optionB",
      name: "方案 B",
      image: "./assets/logos/logo-b.svg",
      keywords: ["亲和", "可爱", "用户感"],
    },
    {
      id: "optionC",
      name: "方案 C",
      image: "./assets/logos/logo-c.svg",
      keywords: ["专业", "平台", "品牌感"],
    },
    // 示例：需要方案 D 时，复制下面这一段并去掉注释。
    // {
    //   id: "optionD",
    //   name: "方案 D",
    //   image: "./assets/logos/logo-d.png",
    //   keywords: ["高级", "视觉感", "传播感"],
    // },
  ],
};
