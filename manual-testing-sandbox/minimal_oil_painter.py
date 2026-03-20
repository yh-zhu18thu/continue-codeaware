import cv2
import numpy as np
import time


class MinimalOilPainter:
    """
    极简油画滤镜：通过“局部亮度统计 + 多数决 + 主导档平均色”实现色块化效果。

    核心参数（固定为成员变量，后续所有计算围绕这两个旋钮展开）：
    - radius（笔触半径）：决定每次“看周围多大一圈”，越大越像大色块、越抽象。
    - levels（亮度等级数）：决定把明暗分成几档（量化桶数），越小越粗犷、颜色更少。
    """

    def __init__(self, radius: int = 5, levels: int = 8):
        self.radius = int(radius)
        self.levels = int(levels)
        if self.radius < 1:
            raise ValueError("radius 必须 >= 1")
        if self.levels < 2:
            raise ValueError("levels 必须 >= 2")

    def paint(self, input_path: str, output_path: str):
        """
        约定文件输入输出方式：
        - 用 input_path 读取 JPEG/常见图片
        - 用 output_path 保存处理后的 JPEG（质量参数可控）
        - 失败时给出可读提示并立即停止
        """
        # 3. 读取图片并校验有效性
        img = cv2.imread(input_path)
        if img is None:
            print(f"错误：无法读取文件 {input_path}（请检查路径或文件是否损坏）")
            return None

        h, w = img.shape[:2]

        # 4. 生成灰度图与输出画布
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        output = np.zeros_like(img)

        print(f"开始极简油画转换 {input_path} (levels={self.levels}, radius={self.radius})...")
        start_time = time.time()

        # 5. 设置有效遍历范围（跳过边缘，避免 ROI 越界）
        r = self.radius
        for y in range(r, h - r):
            for x in range(r, w - r):
                # 6. 截取邻域窗口ROI（灰度 ROI 用于统计；彩色 ROI 用于累加/上色）
                roi_gray = gray[y - r : y + r + 1, x - r : x + r + 1]
                roi_color = img[y - r : y + r + 1, x - r : x + r + 1]

                # 7. 量化灰度到亮度等级（映射到 0..levels-1）
                intensity_map = (roi_gray.astype(np.uint32) * self.levels) // 256

                # 8. 统计各亮度档出现次数
                counts = np.zeros(self.levels, dtype=np.uint32)

                # 9. 累加主导等级的颜色总和（这里先对每一档都累加，后面再选主导档）
                sum_rgb = np.zeros((self.levels, 3), dtype=np.uint32)

                flat_intensity = intensity_map.reshape(-1)
                flat_color = roi_color.reshape(-1, 3)

                for i in range(flat_intensity.shape[0]):
                    lvl = int(flat_intensity[i])
                    counts[lvl] += 1
                    sum_rgb[lvl] += flat_color[i]

                # 10. 选出出现最多的亮度档（多数决）
                max_lvl = int(np.argmax(counts))

                # 11. 计算平均颜色并回填像素
                if counts[max_lvl] > 0:
                    output[y, x] = (sum_rgb[max_lvl] // counts[max_lvl]).astype(np.uint8)

        # 12. 保存JPEG并控制质量
        ok = cv2.imwrite(output_path, output, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
        if not ok:
            print(f"错误：无法写入输出文件 {output_path}")
            return None

        # 13. 输出耗时与效果自检点
        elapsed = time.time() - start_time
        print(f"转换完成！耗时: {elapsed:.2f}秒，已保存至: {output_path}")
        print(f"自检：输出尺寸 {output.shape[:2]}，与原图尺寸 {(h, w)} 一致；边缘未遍历区域偏黑属于预期现象。")

        return output


if __name__ == "__main__":
    # 使用示例：调小 levels（例如 5）可让色块效果更明显；调大 radius 色块更大、更抽象
    painter = MinimalOilPainter(radius=5, levels=8)
    painter.paint("input.jpg", "output_minimal.jpg")