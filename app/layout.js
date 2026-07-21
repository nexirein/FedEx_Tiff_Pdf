import './globals.css'

export const metadata = {
  title: 'FedEx Cargo Operations Toolkit',
  description: 'Convert TIFF to PDF, generate Arrival Notices, and create Ubond/Consol notices',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
