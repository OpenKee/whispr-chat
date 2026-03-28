import { ref, watch } from 'vue'

const STORAGE_KEY = 'whispr_lang'

const currentLang = ref(localStorage.getItem(STORAGE_KEY) || 'zh')

watch(currentLang, (val) => {
  localStorage.setItem(STORAGE_KEY, val)
})

const t = {
  zh: {
    // Home
    title: 'Whispr',
    subtitle: '随机匹配，匿名畅聊',
    gender: '性别',
    male: '男',
    female: '女',
    other: '其他',
    ageRange: '年龄段',
    startChat: '开始聊天',
    editProfile: '修改',
    hint: '匹配到陌生人后即可开始对话',
    featureMatch: '随机匹配',
    featureChat: '实时聊天',
    featureImage: '图片分享',
    featurePrivacy: '匿名隐私',
    featureNoInstall: '无需下载',
    // Chat
    searching: '正在寻找聊天对象...',
    searchingHint: '匹配到陌生人后即可开始对话',
    cancelSearch: '取消',
    seconds: '秒',
    partnerInfo: '对方信息',
    genderMale: '男',
    genderFemale: '女',
    leave: '离开',
    rematch: '重新匹配',
    inputPlaceholder: '输入消息...',
    send: '发送',
    selectImage: '选择图片',
    cancelImage: '取消',
    uploadProgress: '上传中...',
    compressing: '压缩中...',
    systemDisconnected: '你已离开了聊天',
    systemPartnerLeft: '对方已离开了聊天',
    systemReconnectTimeout: '连接超时，请重新匹配',
    systemError: '[错误]',
    confirmLeave: '确定离开聊天吗？',
    titleChatting: '与 {name} 聊天中',
    titleNewMessage: '新消息来自 {name}',
    titlePartnerLeft: '对方已离开',
    imageTooLarge: '图片太大，最大 20MB',
    imageTypeError: '不支持的图片格式，请选择 JPG/PNG/GIF/WEBP',
    imageSending: '发送中...',
    uploadTooFrequent: '上传太频繁，请稍后再试',
    // Report
    report: '举报',
    reportTitle: '举报原因',
    reportSpam: '垃圾广告',
    reportAbuse: '骚扰辱骂',
    reportInappropriate: '不当内容',
    reportOther: '其他',
    reportThanks: '已收到举报，感谢反馈',
    reportCancel: '取消',
    reportSubmit: '提交举报',
    // Footer
    guide: '使用说明',
    contactUs: '联系我们',
    terms: '服务条款',
    privacy: '隐私政策',
    disclaimer: '免责声明',
    about: '关于我们',
    // Language
    lang: 'EN',
    back: '返回',
  },
  en: {
    // Home
    title: 'Whispr',
    subtitle: 'Random match, anonymous chat',
    gender: 'Gender',
    male: 'Male',
    female: 'Female',
    other: 'Other',
    ageRange: 'Age',
    startChat: 'Start Chat',
    editProfile: 'Edit',
    hint: 'You will be matched with a stranger',
    featureMatch: 'Random Match',
    featureChat: 'Live Chat',
    featureImage: 'Image Share',
    featurePrivacy: 'Anonymous',
    featureNoInstall: 'No Install',
    // Chat
    searching: 'Looking for a match...',
    searchingHint: 'You will be matched with a stranger',
    cancelSearch: 'Cancel',
    seconds: 's',
    partnerInfo: 'Partner Info',
    genderMale: 'Male',
    genderFemale: 'Female',
    leave: 'Leave',
    rematch: 'Rematch',
    inputPlaceholder: 'Type a message...',
    send: 'Send',
    selectImage: 'Image',
    cancelImage: 'Cancel',
    uploadProgress: 'Uploading...',
    compressing: 'Compressing...',
    systemDisconnected: 'You left the chat',
    systemPartnerLeft: 'Your partner left the chat',
    systemReconnectTimeout: 'Connection timed out, please rematch',
    systemError: '[Error]',
    confirmLeave: 'Are you sure you want to leave?',
    titleChatting: 'Chatting with {name}',
    titleNewMessage: 'New message from {name}',
    titlePartnerLeft: 'Partner left',
    imageTooLarge: 'Image too large, max 20MB',
    imageTypeError: 'Unsupported format. Please use JPG/PNG/GIF/WEBP',
    imageSending: 'Sending...',
    uploadTooFrequent: 'Too many uploads, please wait',
    // Report
    report: 'Report',
    reportTitle: 'Report Reason',
    reportSpam: 'Spam / Ads',
    reportAbuse: 'Harassment / Abuse',
    reportInappropriate: 'Inappropriate Content',
    reportOther: 'Other',
    reportThanks: 'Report received, thank you',
    reportCancel: 'Cancel',
    reportSubmit: 'Submit Report',
    // Footer
    guide: 'Guide',
    contactUs: 'Contact',
    terms: 'Terms',
    privacy: 'Privacy',
    disclaimer: 'Disclaimer',
    about: 'About',
    // Language
    lang: '中文',
    back: 'Back',
  }
}

function useI18n() {
  const $t = (key, vars) => {
    let text = (t[currentLang.value] && t[currentLang.value][key]) || t.zh[key] || key
    if (vars) {
      Object.keys(vars).forEach(k => {
        text = text.replace(`{${k}}`, vars[k])
      })
    }
    return text
  }

  const toggleLang = () => {
    currentLang.value = currentLang.value === 'zh' ? 'en' : 'zh'
  }

  return { lang: currentLang, $t, toggleLang }
}

export { useI18n }
