import { useEffect } from 'react'
import './PolicyPage.css'

export type PolicyType = 'user' | 'privacy'

interface PolicyPageProps {
  type: PolicyType
}

const USER_POLICY_SECTIONS = [
  {
    title: '一、服务说明',
    paragraphs: [
      '微光问道（以下简称"本服务"）是一款基于人工智能技术的命理分析应用，提供四柱八字、紫微斗数、麻衣神相、六爻占卜、梅花易数、黄历择吉等传统文化内容的学习、分析与参考服务。',
      '本服务所提供的内容均基于传统命理文化知识与人工智能模型的推理生成，仅供个人学习、研究和娱乐参考，不构成任何医疗、投资、法律、婚姻等方面的专业建议。',
    ],
  },
  {
    title: '二、用户账号',
    paragraphs: [
      '您在使用本服务的部分功能（如档案保存、报告生成等）时，需要注册账号。您应提供真实、准确、完整的信息，并妥善保管账号与密码。',
      '因您自身原因导致账号信息泄露、丢失或被盗用所造成的损失，由您自行承担。如发现账号异常，请及时联系我们。',
    ],
  },
  {
    title: '三、使用规范',
    paragraphs: [
      '您承诺在使用本服务过程中遵守相关法律法规，不得利用本服务从事任何违法违规活动，不得上传、发布、传播任何违法或不良信息。',
      '您不得对本服务进行反向工程、破解、篡改，或以任何方式干扰本服务的正常运行。',
    ],
  },
  {
    title: '四、内容与免责声明',
    paragraphs: [
      '本服务生成的所有分析内容均由人工智能模型自动生成，可能存在不准确或不完整之处，不代表本服务的任何立场或承诺。',
      '本服务不对用户基于分析内容所做出的任何决策或行为承担任何责任。请理性看待命理分析结果，相关内容仅供参考。',
    ],
  },
  {
    title: '五、知识产权',
    paragraphs: [
      '本服务的软件、界面设计、商标、文字内容等知识产权归本服务运营方所有。未经许可，您不得擅自复制、传播、修改或用于商业用途。',
    ],
  },
  {
    title: '六、协议的变更与终止',
    paragraphs: [
      '本服务有权根据业务发展需要，适时修订本协议。修订后的协议将在本服务内公布，自公布之日起生效。',
      '如您不同意修订后的协议，应停止使用本服务；继续使用则视为接受修订后的协议。',
    ],
  },
]

const PRIVACY_POLICY_SECTIONS = [
  {
    title: '一、我们收集的信息',
    paragraphs: [
      '账号信息：当您注册账号时，我们会收集您的邮箱地址及加密后的登录凭证。',
      '命理排盘信息：当您使用命理分析功能时，我们会收集您主动填写的出生信息（如出生日期、时间、地点、性别）及姓名等信息，用于生成分析结果。',
      '使用信息：我们会收集您的设备类型、浏览器类型、访问时间等基本使用信息，用于改进服务质量。',
    ],
  },
  {
    title: '二、我们如何使用信息',
    paragraphs: [
      '为您提供命理分析与报告生成等核心功能。',
      '用于账号管理、安全验证、问题排查与客户支持。',
      '用于改进和优化本服务的功能与用户体验。',
      '我们不会将您的个人信息用于与本服务无关的用途。',
    ],
  },
  {
    title: '三、信息的存储与保护',
    paragraphs: [
      '您的信息存储于我们安全管理的服务器中。我们采取合理的技术与管理措施保护您的个人信息安全，防止信息被未经授权的访问、使用或泄露。',
      '您的密码以加密形式存储，我们不会以明文形式保存您的密码。',
    ],
  },
  {
    title: '四、信息的共享与披露',
    paragraphs: [
      '我们不会向任何第三方出售您的个人信息。',
      '除法律法规要求、司法或行政机关依法要求，或为保护我们及用户的合法权益所必需外，我们不会向第三方披露您的个人信息。',
    ],
  },
  {
    title: '五、您的权利',
    paragraphs: [
      '您有权查询、更正、删除您的个人信息，也有权注销您的账号。您可以通过本服务提供的相关功能或联系我们行使上述权利。',
    ],
  },
  {
    title: '六、政策的更新',
    paragraphs: [
      '我们可能适时更新本隐私政策。更新后，我们会在本服务内公布最新版本。重大变更时，我们会以适当方式通知您。',
    ],
  },
]

export default function PolicyPage({ type }: PolicyPageProps) {
  const isUserPolicy = type === 'user'
  const title = isUserPolicy ? '用户协议' : '隐私政策'
  const updatedDate = '2026年8月17日'
  const sections = isUserPolicy ? USER_POLICY_SECTIONS : PRIVACY_POLICY_SECTIONS

  useEffect(() => {
    document.title = `${title} - 微光问道`
  }, [title])

  return (
    <div className="policy-page">
      <div className="policy-page-body">
        <h1 className="policy-page-title">{title}</h1>
        <div className="policy-page-meta">更新日期：{updatedDate}</div>
        {sections.map((section) => (
          <section key={section.title} className="policy-section">
            <h2 className="policy-section-title">{section.title}</h2>
            {section.paragraphs.map((p, i) => (
              <p key={i} className="policy-paragraph">{p}</p>
            ))}
          </section>
        ))}
        <div className="policy-page-footer">微光问道 · GlimmerDao</div>
      </div>
    </div>
  )
}
