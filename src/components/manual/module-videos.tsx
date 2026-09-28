"use client";

import { ExternalLink, Play } from "lucide-react";
import { useState } from "react";

export type ModuleVideo = { id: string; url: string; title: string; channel: string; why: string; thumbnail: string; embed: string };

/**
 * Fachada de YouTube: primero una miniatura y un botón. El iframe
 * (youtube-nocookie) se crea recién al pulsar, así la página no pide nada a
 * YouTube hasta que alguien decide ver el video.
 */
function VideoFacade({ video }: { video: ModuleVideo }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="card flex h-full flex-col overflow-hidden">
      <div className="relative aspect-video w-full bg-black">
        {playing ? (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={video.embed}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group absolute inset-0 h-full w-full"
            aria-label={`Reproducir «${video.title}»`}
          >
            {/* Miniatura externa servida por YouTube; no pasa por el optimizador de imágenes. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={video.thumbnail} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100" />
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-black/70 text-white shadow-lg transition-transform group-hover:scale-105">
                <Play size={20} fill="currentColor" />
              </span>
            </span>
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <div className="text-ink line-clamp-2 text-[13px] leading-snug font-semibold" title={video.title}>{video.title}</div>
        {video.channel ? <div className="text-inkmuted text-[11.5px]">{video.channel}</div> : null}
        {video.why ? (
          <details className="text-[12px]">
            <summary className="text-brand cursor-pointer font-semibold">Qué mirar</summary>
            <p className="text-inksoft mt-1 leading-relaxed">{video.why}</p>
          </details>
        ) : null}
        <a href={video.url} target="_blank" rel="noopener noreferrer" className="text-inkmuted hover:text-ink mt-auto inline-flex items-center gap-1 pt-1 text-[11.5px] font-semibold">
          <ExternalLink size={12} /> Abrir en YouTube
        </a>
      </div>
    </div>
  );
}

export function ModuleVideos({ videos }: { videos: ModuleVideo[] }) {
  return (
    // En móvil, una tira deslizable dentro de la tarjeta; desde sm, una grilla.
    <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-3.5 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-3" aria-label="Videos del módulo">
      {videos.map(video => (
        <li key={video.id + video.url} className="w-[80%] max-w-[320px] shrink-0 snap-start sm:w-auto sm:max-w-none">
          <VideoFacade video={video} />
        </li>
      ))}
    </ul>
  );
}
