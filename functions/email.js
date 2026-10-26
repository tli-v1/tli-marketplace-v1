import nodemailer from 'nodemailer'

export const emailTransport = { create: options => nodemailer.createTransport(options) }

export const sendEmailNotification = async ({ to, subject, text }) => {
  const user = process.env.GMAIL_USER || 'ethan@truelegalinnovations.com'
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '')
  if (!pass) return { status: 'missing_provider', provider: 'gmail-smtp' }

  const transport = emailTransport.create({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    disableFileAccess: true,
    disableUrlAccess: true,
  })
  try {
    const result = await transport.sendMail({
      from: { name: 'TLI Marketplace', address: user },
      to, subject, text,
    })
    if (!result.accepted?.some((address) => address.toLowerCase() === to.toLowerCase())) {
      throw new Error('Gmail SMTP did not accept the notification recipient.')
    }
    return { status: 'sent', provider: 'gmail-smtp' }
  } finally {
    transport.close()
  }
}
