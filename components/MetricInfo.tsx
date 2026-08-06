"use client";

import { useState } from "react";
import { CloseIcon, InfoIcon } from "./icons";

/**
 * What each figure on the financial card actually means.
 *
 * These are ratios an investor is expected to already know, and this app is
 * for people who are learning the market rather than people who have already
 * learned it. Each one says what it measures, how to read a high or a low
 * one, and — where it matters — what a negative one means.
 */
export const METRIC_TERMS = {
  pe: {
    title: "P/E — Үнэ / Ашгийн харьцаа",
    body:
      "Хувьцааны ханшийг нэгж хувьцаанд ногдох жилийн ашигт (EPS) харьцуулсан " +
      "тоо. P/E нь 10 бол хөрөнгө оруулагчид тухайн компанийн нэг жилийн " +
      "ашгийн 10 дахин үнээр хувьцааг нь авч байна гэсэн үг — өөрөөр хэлбэл " +
      "ашиг нь өнөөгийн түвшинд хэвээр байвал хөрөнгө оруулалт 10 жилд " +
      "нөхөгдөнө.\n\n" +
      "Бага P/E нь хямд үнэлгээг илэрхийлж болох ч компанийн ашиг буурах " +
      "хүлээлттэй байгааг ч илэрхийлж болно. Өндөр P/E нь эсрэгээрээ ирээдүйн " +
      "өсөлтөд өндөр хүлээлт тавьж байгааг харуулна. Алдагдалтай компанид " +
      "P/E тооцогдохгүй.",
  },
  marketPe: {
    title: "Захын дундаж P/E",
    body:
      "МХБ-д бүртгэлтэй, ашигтай ажиллаж буй компаниудын P/E-ийн медиан " +
      "утга. Дундаж биш медиан авдаг нь нэг хоёр компанийн туйлын өндөр P/E " +
      "бүх зургийг гажуудуулахаас сэргийлдэг.\n\n" +
      "Тухайн компанийн P/E үүнээс доогуур бол зах зээлийнхээ дунджтай " +
      "харьцуулахад хямд, дээгүүр бол үнэтэй үнэлэгдэж байна гэсэн үг. " +
      "Гэхдээ салбар салбарын P/E өөр өөр байдгийг анхаарна уу.",
  },
  eps: {
    title: "EPS — Нэгж хувьцаанд ногдох ашиг",
    body:
      "Компанийн татварын дараах цэвэр ашгийг нийт гаргасан хувьцааны тоонд " +
      "хуваасан дүн. Нэг ширхэг хувьцаа тайлант хугацаанд хэдэн төгрөгийн " +
      "ашиг олсныг харуулна.\n\n" +
      "EPS өсөж байгаа нь компанийн ашиг нэмэгдэж байгааг, сөрөг EPS нь " +
      "компани алдагдалтай ажилласныг илэрхийлнэ. Ногдол ашиг нь ихэвчлэн " +
      "энэ ашгаас хуваарилагддаг.",
  },
  roe: {
    title: "ROE % — Өөрийн хөрөнгийн өгөөж",
    body:
      "Цэвэр ашгийг хувьцаа эзэмшигчдийн өмчид харьцуулсан хувь. Эзэд " +
      "компанид байршуулсан 100 төгрөг тутмаас жилд хэдэн төгрөгийн ашиг " +
      "олж байгааг хэмжинэ.\n\n" +
      "Өндөр ROE нь компани эздийн мөнгийг үр ашигтай ажиллуулж байгааг " +
      "харуулна. Гэхдээ их хэмжээний зээлтэй компанийн ROE зохиомлоор өндөр " +
      "гарч болзошгүй тул ROA-тай нь хамт харах нь зөв.",
  },
  roa: {
    title: "ROA % — Хөрөнгийн өгөөж",
    body:
      "Цэвэр ашгийг компанийн нийт хөрөнгөд харьцуулсан хувь. Эзэмшиж буй " +
      "бүх хөрөнгөө — зээлээр авсныг нь ч оруулаад — ашиг олоход хэр үр " +
      "дүнтэй ашиглаж байгааг хэмжинэ.\n\n" +
      "ROE өндөр атлаа ROA нам байвал ашгийн ихэнх нь өөрийн хөрөнгөнөөс " +
      "бус зээлийн хөшүүргээс гарч байна гэсэн дохио.",
  },
  netProfit: {
    title: "Цэвэр ашиг",
    body:
      "Тайлант хугацаанд бүх зардал, хүү, татварыг хассаны дараа компанид " +
      "үлдэх эцсийн ашиг. Компанийн үйл ажиллагааны үр дүнг нэг тоогоор " +
      "илэрхийлдэг үндсэн үзүүлэлт.\n\n" +
      "Сөрөг байвал компани тайлант хугацаанд алдагдалтай ажилласан гэсэн " +
      "үг. Нэг улирлын тоо улирлын чанартай хэлбэлзэж болох тул хандлагыг " +
      "нь хэдэн улирлаар харах нь зөв.",
  },
} as const;

export type MetricTerm = keyof typeof METRIC_TERMS;

/**
 * An "i" beside a label that opens the explanation.
 *
 * A centred sheet rather than a tooltip anchored to the icon: this sits in a
 * card a third of a wide screen across and the whole width of a phone, and
 * an explanation long enough to be worth reading does not fit beside either.
 */
export default function MetricInfo({ term }: { term: MetricTerm }) {
  const [open, setOpen] = useState(false);
  const { title, body } = METRIC_TERMS[term];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${title} гэж юу вэ?`}
        className="ml-1 inline-flex translate-y-px align-middle text-app-muted active:opacity-60"
      >
        <InfoIcon size={12} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
        >
          <div
            // The sheet is not the backdrop; a tap inside it should not close.
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-app-border bg-app-card p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-app-text">{title}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Хаах"
                className="shrink-0 text-app-muted active:opacity-60"
              >
                <CloseIcon size={18} />
              </button>
            </div>

            {/* Paragraphs, because these run to two and reading them as one
                block is what makes a definition feel like a wall. */}
            <div className="mt-3 space-y-2.5">
              {body.split("\n\n").map((paragraph, i) => (
                <p key={i} className="text-xs leading-relaxed text-app-muted">
                  {paragraph}
                </p>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 w-full rounded-2xl bg-brand py-2.5 text-sm font-semibold text-black active:scale-[0.98] transition-transform"
            >
              Ойлголоо
            </button>
          </div>
        </div>
      )}
    </>
  );
}
