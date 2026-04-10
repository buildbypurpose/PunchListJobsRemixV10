import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { ArrowLeft } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function getYoutubeId(url) {
  try {
    const m = url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?]+)/);
    return m ? m[1] : "";
  } catch { return ""; }
}

export default function CmsPage() {
  const { slug } = useParams();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    axios.get(`${API}/cms/pages/${slug}`)
      .then(r => setPage(r.data))
      .catch(() => setPage(null))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#020617]">
      <div className="w-8 h-8 border-2 border-[#0000FF] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!page) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-white dark:bg-[#020617]">
      <p className="text-slate-500">Page not found.</p>
      <Link to="/" className="text-[#0000FF] hover:underline text-sm">Back to home</Link>
    </div>
  );

  let faqItems = null;
  if (slug === "faqs") {
    try { faqItems = JSON.parse(page.content); } catch { }
  }

  const youtubeId = page.youtube_url ? getYoutubeId(page.youtube_url) : null;

  return (
    <div className="min-h-screen bg-white dark:bg-[#020617]" style={{ fontFamily: "Inter, sans-serif" }}>
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link to="/" className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-sm mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to home
        </Link>

        {youtubeId && (
          <div className="aspect-video mb-8 rounded-xl overflow-hidden shadow-lg">
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}`}
              className="w-full h-full"
              allowFullScreen
              title={page.title}
            />
          </div>
        )}

        <h1 className="text-3xl font-extrabold text-[#050A30] dark:text-white mb-2" style={{ fontFamily: "Manrope, sans-serif" }}>
          {page.title}
        </h1>
        {page.header_text && (
          <p className="text-base text-slate-500 dark:text-slate-400 mb-8 border-b border-slate-100 dark:border-slate-800 pb-6">
            {page.header_text}
          </p>
        )}

        {faqItems ? (
          <div className="space-y-3" data-testid="faq-list">
            {faqItems.map((item, i) => (
              <details key={i} className="border border-slate-200 dark:border-slate-700 rounded-xl group">
                <summary className="px-5 py-4 font-semibold text-[#050A30] dark:text-white cursor-pointer list-none flex items-center justify-between text-sm">
                  {item.question}
                  <span className="text-slate-400 text-xs group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <p className="px-5 pb-4 text-sm text-slate-500 dark:text-slate-400">{item.answer}</p>
              </details>
            ))}
          </div>
        ) : (
          <div
            className="prose prose-slate dark:prose-invert max-w-none text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: page.content }}
            data-testid="cms-content"
          />
        )}
      </div>
    </div>
  );
}
