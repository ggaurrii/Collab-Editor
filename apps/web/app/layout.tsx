export const metadata = { title: "Collab Editor" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#1e1e1e", color: "#ddd" }}>
        {children}
      </body>
    </html>
  );
}
