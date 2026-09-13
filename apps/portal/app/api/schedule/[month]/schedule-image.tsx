import {
  SCHEDULE_FOOTER_HEIGHT,
  SCHEDULE_HEADER_HEIGHT,
  SCHEDULE_IMAGE_WIDTH,
  type ScheduleRow,
  scheduleRowHeight,
} from "@hoopo/api";
import type { ReactElement } from "react";

// 予定表画像の見た目(REQUIREMENTS §6「1ヶ月を1日1行、練習日に時間+学校名」)。
// 色は apps/portal/app/globals.css のトークンと同じ値(保護者側=薄いオレンジ。CLAUDE.md 絶対原則6)。
// satori は flexbox のみを解釈するため、display: flex を明示し、テキストは末端の要素に置く。
// §10 未決(現行アプリのスクリーンショット待ち)のため、まずは素直な縦型で作る

const BG = "#f5f3ef";
const PAPER = "#fff";
const INK = "#1a1511";
const SUB = "#7d7368";
const FAINT = "#b3a99e";
const HAIR = "rgba(58, 42, 22, 0.12)";
const ACCENT = "#ef8432";
const TINT = "#fcebda";
const DEEP = "#9c4e0e";

/** 日曜は deep、土曜は sub、平日は ink(練習の無い日は薄く) */
function dayColor(weekday: number, hasPractice: boolean): string {
  if (weekday === 0) return DEEP;
  if (weekday === 6) return SUB;
  return hasPractice ? INK : SUB;
}

export interface ScheduleImageProps {
  teamName: string;
  monthLabel: string;
  rows: readonly ScheduleRow[];
  height: number;
}

export function ScheduleImage({
  teamName,
  monthLabel,
  rows,
  height,
}: ScheduleImageProps): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: SCHEDULE_IMAGE_WIDTH,
        height,
        background: BG,
        color: INK,
        fontFamily: "Noto Sans JP",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          height: SCHEDULE_HEADER_HEIGHT,
          padding: "0 28px",
          background: PAPER,
          borderBottom: `3px solid ${ACCENT}`,
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 700, color: INK }}>
          {teamName}
        </div>
        <div style={{ fontSize: 20, color: SUB, marginTop: 6 }}>
          {`${monthLabel} 練習予定`}
        </div>
      </div>

      <div
        style={{ display: "flex", flexDirection: "column", background: PAPER }}
      >
        {rows.map((row) => {
          const hasPractice = row.entries.length > 0;
          return (
            <div
              key={row.date}
              style={{
                display: "flex",
                alignItems: "center",
                height: scheduleRowHeight(row.entries.length),
                padding: "0 28px",
                borderBottom: `1px solid ${HAIR}`,
                background: hasPractice ? TINT : PAPER,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  width: 34,
                  fontSize: 20,
                  fontWeight: 700,
                  color: dayColor(row.weekday, hasPractice),
                }}
              >
                {String(row.day)}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  width: 34,
                  fontSize: 15,
                  color: dayColor(row.weekday, hasPractice),
                }}
              >
                {row.weekdayLabel}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  flexGrow: 1,
                }}
              >
                {row.entries.map((entry) => (
                  <div
                    key={`${entry.time}-${entry.location}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      height: 22,
                      fontSize: 16,
                      color: INK,
                    }}
                  >
                    <div
                      style={{ display: "flex", width: 120, fontWeight: 700 }}
                    >
                      {entry.time}
                    </div>
                    <div style={{ display: "flex" }}>{entry.location}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          flexGrow: 1,
          minHeight: SCHEDULE_FOOTER_HEIGHT,
          padding: "0 28px",
          fontSize: 13,
          color: FAINT,
        }}
      >
        powered by hoopo
      </div>
    </div>
  );
}
