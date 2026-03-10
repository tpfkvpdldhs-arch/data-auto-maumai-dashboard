import tempfile
import textwrap
import unittest
from pathlib import Path

import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from collect_and_upload import extract_map_code, parse_recording_csv  # noqa: E402


class ParseRecordingCsvTests(unittest.TestCase):
    def write_csv(self, content: str) -> Path:
        tmp_dir = Path(tempfile.mkdtemp(prefix="collect_upload_test_"))
        csv_path = tmp_dir / "recording_duration.csv"
        csv_path.write_text(textwrap.dedent(content).strip() + "\n", encoding="utf-8")
        return csv_path

    def test_parse_valid_and_rejected_rows(self) -> None:
        csv_path = self.write_csv(
            """
            source_folder,folder_sort_key,filename,start_time,end_time,duration_sec,duration_mmss,map_segment,map_name,scenario_input
            bag,0,a.recording.log,2026-02-23 14:04:04.437,2026-02-23 14:11:00.715,416.278,06:56,r_road_west256_1,sim_anseong_golf_course_north16,mowing
            bag_failed,1,b.recording.log,ERROR_TS,ERROR_TS,ERROR,ERROR,f_outline_west256_2,,
            """
        )

        result = parse_recording_csv(csv_path, "Asia/Seoul")
        self.assertEqual(len(result.records), 1)
        self.assertEqual(result.rejected_count, 1)
        self.assertEqual(result.records[0]["source_folder"], "bag")
        self.assertTrue(result.records[0]["start_time"].endswith("+09:00"))
        self.assertEqual(result.records[0]["map_code"], "north16")
        self.assertEqual(result.records[0]["scenario_input"], "mowing")

    def test_unsupported_source_folder_is_rejected(self) -> None:
        csv_path = self.write_csv(
            """
            source_folder,folder_sort_key,filename,start_time,end_time,duration_sec,duration_mmss,map_segment,map_name,scenario_input
            bag_retry,2,c.recording.log,2026-02-23 14:04:04.437,2026-02-23 14:11:00.715,416.278,06:56,r_road_west256_1
            """
        )

        result = parse_recording_csv(csv_path, "Asia/Seoul")
        self.assertEqual(len(result.records), 0)
        self.assertEqual(result.rejected_count, 1)

    def test_extract_map_code_fallback(self) -> None:
        self.assertEqual(extract_map_code("sim_anseong_golf_course_east12", "r_road_west256_1"), "east12")
        self.assertEqual(extract_map_code("", "f_outline_north16_2"), "north16")
        self.assertEqual(extract_map_code("", "unknown_segment"), "unknown")


if __name__ == "__main__":
    unittest.main()
