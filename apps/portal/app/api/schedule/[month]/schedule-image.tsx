import {
  SCHEDULE_FONT_DAY,
  SCHEDULE_FONT_ENTRY,
  SCHEDULE_FONT_FOOTER,
  SCHEDULE_FONT_MONTH,
  SCHEDULE_FONT_TEAM,
  SCHEDULE_FONT_WEEKDAY,
  SCHEDULE_FOOTER_HEIGHT,
  SCHEDULE_HEADER_HEIGHT,
  SCHEDULE_IMAGE_WIDTH,
  SCHEDULE_ROW_HEIGHT,
  type ScheduleRow,
  scheduleEntryFontSize,
  scheduleEntryLineHeight,
} from "@hoopo/api";
import type { ReactElement } from "react";

// 予定表画像の見た目(REQUIREMENTS §6「1ヶ月を1日1行、練習日に時間+学校名」)。
// 色は apps/portal/app/globals.css のトークンと同じ値(保護者側=薄いオレンジ。CLAUDE.md 絶対原則6)。
// satori は flexbox のみを解釈するため、display: flex を明示し、テキストは末端の要素に置く
// (grid は使えない)。
// 縦1列・1日1行で、スマホの全画面表示に1か月が収まる縦長にする(#215。#204 の2カラムを見直し)。
// 行の高さは固定で、同じ日に複数コマある日は行の中に縦に積んで文字を小さくする

const BG = "#f5f3ef";
const PAPER = "#fff";
const INK = "#1a1511";
const SUB = "#7d7368";
const FAINT = "#b3a99e";
const HAIR = "rgba(58, 42, 22, 0.12)";
const ACCENT = "#ef8432";
const TINT = "#fcebda";
const DEEP = "#9c4e0e";

/** 行の左右の余白 */
const ROW_PADDING = 28;
/** 日付・曜日・時間の桁を揃えるための固定幅(時間は 1件のときの文字サイズで「18:30–21:00」が入る幅) */
const DAY_WIDTH = 64;
const WEEKDAY_WIDTH = 64;
const TIME_WIDTH = 250;
/** 曜日と時間の間 */
const ENTRY_GAP = 12;

/** 日曜は deep、土曜は sub、平日は ink(練習の無い日は薄く) */
function dayColor(weekday: number, hasPractice: boolean): string {
  if (weekday === 0) return DEEP;
  if (weekday === 6) return SUB;
  return hasPractice ? INK : SUB;
}

function ScheduleRowView({ row }: { row: ScheduleRow }): ReactElement {
  const hasPractice = row.entries.length > 0;
  const entryHeight = scheduleEntryLineHeight(row.entries.length);
  const entryFont = scheduleEntryFontSize(row.entries.length);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: SCHEDULE_ROW_HEIGHT,
        padding: `0 ${ROW_PADDING}px`,
        borderBottom: `1px solid ${HAIR}`,
        background: hasPractice ? TINT : PAPER,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          width: DAY_WIDTH,
          flexShrink: 0,
          fontSize: SCHEDULE_FONT_DAY,
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
          width: WEEKDAY_WIDTH,
          flexShrink: 0,
          fontSize: SCHEDULE_FONT_WEEKDAY,
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
          // flexBasis: 0 + overflow: hidden で、長い場所名がこのカラムの外へ
          // はみ出したり日付・曜日を押し出したりしないようにする
          flexGrow: 1,
          flexBasis: 0,
          minWidth: 0,
          overflow: "hidden",
          marginLeft: ENTRY_GAP,
        }}
      >
        {row.entries.map((entry) => (
          <div
            key={`${entry.time}-${entry.location}`}
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              height: entryHeight,
              fontSize: entryFont,
              color: INK,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                // 複数コマの日は文字が小さいぶん時間の幅も縮めて、場所に幅を回す
                width: (TIME_WIDTH * entryFont) / SCHEDULE_FONT_ENTRY,
                flexShrink: 0,
                fontWeight: 700,
              }}
            >
              {entry.time}
            </div>
            {/* 想定より長い場所名は1行に収めて末尾を省略する(行が折り返すと高さの計算とずれる) */}
            <div
              style={{
                flexGrow: 1,
                flexShrink: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {entry.location}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
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
          padding: "0 32px",
          background: PAPER,
          borderBottom: `3px solid ${ACCENT}`,
        }}
      >
        <div
          style={{ fontSize: SCHEDULE_FONT_TEAM, fontWeight: 700, color: INK }}
        >
          {teamName}
        </div>
        <div
          style={{ fontSize: SCHEDULE_FONT_MONTH, color: SUB, marginTop: 6 }}
        >
          {`${monthLabel} 練習予定`}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          background: PAPER,
        }}
      >
        {rows.map((row) => (
          <ScheduleRowView key={row.date} row={row} />
        ))}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          height: SCHEDULE_FOOTER_HEIGHT,
          padding: "0 32px",
          fontSize: SCHEDULE_FONT_FOOTER,
          color: FAINT,
        }}
      >
        powered by hoopo
      </div>
    </div>
  );
}
