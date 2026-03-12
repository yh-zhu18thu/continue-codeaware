import argparse
import os
from dataclasses import dataclass
from typing import Dict, List, Literal, Optional, Tuple

import cv2
import numpy as np


EnergyMethod = Literal["sobel", "scharr", "luma_grad"]


@dataclass(frozen=True)
class ResizeRequest:
    input_path: str
    output_path: str
    target_width: int
    target_height: int
    energy_method: EnergyMethod = "sobel"
    protect_mask_path: Optional[str] = None
    remove_mask_path: Optional[str] = None
    visualize_dir: Optional[str] = None
    visualize_every: int = 1


def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def _read_image_bgr(path: str) -> np.ndarray:
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise FileNotFoundError(f"Cannot read image: {path}")
    return img


def _read_mask(path: str, shape_hw: Tuple[int, int]) -> np.ndarray:
    mask = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if mask is None:
        raise FileNotFoundError(f"Cannot read mask: {path}")
    if mask.shape[:2] != shape_hw:
        mask = cv2.resize(mask, (shape_hw[1], shape_hw[0]), interpolation=cv2.INTER_NEAREST)
    mask = (mask > 0).astype(np.uint8)
    return mask


def _to_gray_float(img_bgr: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    return gray


def compute_energy(img_bgr: np.ndarray, method: EnergyMethod) -> np.ndarray:
    gray = _to_gray_float(img_bgr)

    if method == "sobel":
        gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
        energy = np.abs(gx) + np.abs(gy)
    elif method == "scharr":
        gx = cv2.Scharr(gray, cv2.CV_32F, 1, 0)
        gy = cv2.Scharr(gray, cv2.CV_32F, 0, 1)
        energy = np.abs(gx) + np.abs(gy)
    elif method == "luma_grad":
        # brightness gradient: finite differences
        gx = np.zeros_like(gray, dtype=np.float32)
        gy = np.zeros_like(gray, dtype=np.float32)
        gx[:, 1:-1] = (gray[:, 2:] - gray[:, :-2]) * 0.5
        gx[:, 0] = gray[:, 1] - gray[:, 0]
        gx[:, -1] = gray[:, -1] - gray[:, -2]
        gy[1:-1, :] = (gray[2:, :] - gray[:-2, :]) * 0.5
        gy[0, :] = gray[1, :] - gray[0, :]
        gy[-1, :] = gray[-1, :] - gray[-2, :]
        energy = np.abs(gx) + np.abs(gy)
    else:
        raise ValueError(f"Unknown energy method: {method}")

    return energy.astype(np.float32)


def apply_masks_to_energy(
    energy: np.ndarray,
    protect_mask: Optional[np.ndarray],
    remove_mask: Optional[np.ndarray],
    protect_boost: float = 1e6,
    remove_penalty: float = 1e6,
) -> np.ndarray:
    e = energy.copy()
    if protect_mask is not None:
        e = e + protect_mask.astype(np.float32) * protect_boost
    if remove_mask is not None:
        e = e - remove_mask.astype(np.float32) * remove_penalty
    return e


def cumulative_energy_map_vertical(energy: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    h, w = energy.shape
    M = np.zeros((h, w), dtype=np.float32)
    backtrack = np.zeros((h, w), dtype=np.int32)

    M[0] = energy[0]
    backtrack[0] = -1

    for i in range(1, h):
        prev = M[i - 1]
        left = np.roll(prev, 1)
        right = np.roll(prev, -1)

        left[0] = np.inf
        right[-1] = np.inf

        candidates = np.stack([left, prev, right], axis=0)  # 0: left-up, 1: up, 2: right-up
        idx = np.argmin(candidates, axis=0).astype(np.int32)

        M[i] = energy[i] + candidates[idx, np.arange(w)]
        backtrack[i] = idx - 1  # -1,0,1 shift relative to column

    return M, backtrack


def find_vertical_seam(M: np.ndarray, backtrack: np.ndarray) -> np.ndarray:
    h, w = M.shape
    seam = np.zeros(h, dtype=np.int32)

    j = int(np.argmin(M[-1]))
    seam[-1] = j

    for i in range(h - 2, -1, -1):
        j = j + int(backtrack[i + 1, j])
        j = max(0, min(w - 1, j))
        seam[i] = j

    return seam


def remove_vertical_seam(img_bgr: np.ndarray, seam: np.ndarray) -> np.ndarray:
    h, w, c = img_bgr.shape
    out = np.zeros((h, w - 1, c), dtype=img_bgr.dtype)
    for i in range(h):
        j = seam[i]
        out[i, :, :] = np.concatenate([img_bgr[i, :j, :], img_bgr[i, j + 1 :, :]], axis=0)
    return out


def remove_vertical_seam_mask(mask: np.ndarray, seam: np.ndarray) -> np.ndarray:
    h, w = mask.shape
    out = np.zeros((h, w - 1), dtype=mask.dtype)
    for i in range(h):
        j = seam[i]
        out[i, :] = np.concatenate([mask[i, :j], mask[i, j + 1 :]], axis=0)
    return out


def cumulative_energy_map_horizontal(energy: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    # Compute via transpose and reuse vertical DP, then transpose back
    Mt, bt = cumulative_energy_map_vertical(energy.T)
    return Mt.T, bt.T


def find_horizontal_seam(M: np.ndarray, backtrack: np.ndarray) -> np.ndarray:
    # Find seam indices per column (row index for each column)
    Mt = M.T
    bt = backtrack.T
    seam_t = find_vertical_seam(Mt, bt)  # length = width, values are row indices
    return seam_t


def remove_horizontal_seam(img_bgr: np.ndarray, seam: np.ndarray) -> np.ndarray:
    h, w, c = img_bgr.shape
    out = np.zeros((h - 1, w, c), dtype=img_bgr.dtype)
    for j in range(w):
        i = seam[j]
        out[:, j, :] = np.concatenate([img_bgr[:i, j, :], img_bgr[i + 1 :, j, :]], axis=0)
    return out


def remove_horizontal_seam_mask(mask: np.ndarray, seam: np.ndarray) -> np.ndarray:
    h, w = mask.shape
    out = np.zeros((h - 1, w), dtype=mask.dtype)
    for j in range(w):
        i = seam[j]
        out[:, j] = np.concatenate([mask[:i, j], mask[i + 1 :, j]], axis=0)
    return out


def overlay_vertical_seam(img_bgr: np.ndarray, seam: np.ndarray, color: Tuple[int, int, int] = (0, 0, 255)) -> np.ndarray:
    vis = img_bgr.copy()
    for i, j in enumerate(seam):
        vis[i, j] = color
    return vis


def overlay_horizontal_seam(img_bgr: np.ndarray, seam: np.ndarray, color: Tuple[int, int, int] = (0, 0, 255)) -> np.ndarray:
    vis = img_bgr.copy()
    for j, i in enumerate(seam):
        vis[i, j] = color
    return vis


def _norm_to_uint8(img: np.ndarray) -> np.ndarray:
    x = img.astype(np.float32)
    x = x - np.min(x)
    denom = float(np.max(x) - np.min(x))
    if denom < 1e-12:
        return np.zeros_like(x, dtype=np.uint8)
    x = (x / denom) * 255.0
    return np.clip(x, 0, 255).astype(np.uint8)


def _save_visuals(
    out_dir: str,
    step_idx: int,
    energy: np.ndarray,
    M: np.ndarray,
    seam_overlay_bgr: np.ndarray,
    orientation: Literal["vertical", "horizontal"],
) -> None:
    _ensure_dir(out_dir)
    energy_u8 = _norm_to_uint8(energy)
    M_u8 = _norm_to_uint8(M)
    cv2.imwrite(os.path.join(out_dir, f"{step_idx:05d}_{orientation}_energy.png"), energy_u8)
    cv2.imwrite(os.path.join(out_dir, f"{step_idx:05d}_{orientation}_cost.png"), M_u8)
    cv2.imwrite(os.path.join(out_dir, f"{step_idx:05d}_{orientation}_seam.png"), seam_overlay_bgr)


def _evaluate_structure(
    original_bgr: np.ndarray,
    resized_bgr: np.ndarray,
) -> Dict[str, float]:
    # Compare edges and detect potential artifacts via edge density difference and gradient correlation
    orig_gray = _to_gray_float(original_bgr)
    res_gray = _to_gray_float(resized_bgr)

    res_h, res_w = res_gray.shape
    orig_resized = cv2.resize(orig_gray, (res_w, res_h), interpolation=cv2.INTER_AREA)

    def edge_map(x: np.ndarray) -> np.ndarray:
        gx = cv2.Sobel(x, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(x, cv2.CV_32F, 0, 1, ksize=3)
        mag = np.sqrt(gx * gx + gy * gy)
        return mag

    e1 = edge_map(orig_resized)
    e2 = edge_map(res_gray)

    edge_density_1 = float(np.mean(e1 > np.percentile(e1, 75)))
    edge_density_2 = float(np.mean(e2 > np.percentile(e2, 75)))
    edge_density_diff = abs(edge_density_1 - edge_density_2)

    v1 = e1.flatten()
    v2 = e2.flatten()
    v1m = v1 - v1.mean()
    v2m = v2 - v2.mean()
    denom = float(np.linalg.norm(v1m) * np.linalg.norm(v2m) + 1e-12)
    grad_corr = float(np.dot(v1m, v2m) / denom)

    return {
        "edge_density_orig_resized": edge_density_1,
        "edge_density_resized": edge_density_2,
        "edge_density_diff": edge_density_diff,
        "grad_corr": grad_corr,
    }


def seam_carve_resize(req: ResizeRequest) -> Dict[str, float]:
    img = _read_image_bgr(req.input_path)
    original = img.copy()

    h, w = img.shape[:2]
    if req.target_width <= 0 or req.target_height <= 0:
        raise ValueError("target width/height must be positive")
    if req.target_width > w or req.target_height > h:
        raise ValueError("This implementation supports only reduction (target <= original)")

    protect_mask = _read_mask(req.protect_mask_path, (h, w)) if req.protect_mask_path else None
    remove_mask = _read_mask(req.remove_mask_path, (h, w)) if req.remove_mask_path else None

    step = 0
    while img.shape[1] > req.target_width or img.shape[0] > req.target_height:
        cur_h, cur_w = img.shape[:2]
        need_w = cur_w > req.target_width
        need_h = cur_h > req.target_height

        if need_w:
            energy = compute_energy(img, req.energy_method)
            energy = apply_masks_to_energy(energy, protect_mask, remove_mask)
            M, bt = cumulative_energy_map_vertical(energy)
            seam = find_vertical_seam(M, bt)

            if req.visualize_dir and (step % max(1, req.visualize_every) == 0):
                seam_vis = overlay_vertical_seam(img, seam)
                _save_visuals(req.visualize_dir, step, energy, M, seam_vis, "vertical")

            img = remove_vertical_seam(img, seam)
            if protect_mask is not None:
                protect_mask = remove_vertical_seam_mask(protect_mask, seam)
            if remove_mask is not None:
                remove_mask = remove_vertical_seam_mask(remove_mask, seam)

            step += 1
            continue

        if need_h:
            energy = compute_energy(img, req.energy_method)
            energy = apply_masks_to_energy(energy, protect_mask, remove_mask)
            M, bt = cumulative_energy_map_horizontal(energy)
            seam = find_horizontal_seam(M, bt)

            if req.visualize_dir and (step % max(1, req.visualize_every) == 0):
                seam_vis = overlay_horizontal_seam(img, seam)
                _save_visuals(req.visualize_dir, step, energy, M, seam_vis, "horizontal")

            img = remove_horizontal_seam(img, seam)
            if protect_mask is not None:
                protect_mask = remove_horizontal_seam_mask(protect_mask, seam)
            if remove_mask is not None:
                remove_mask = remove_horizontal_seam_mask(remove_mask, seam)

            step += 1
            continue

    cv2.imwrite(req.output_path, img)
    return _evaluate_structure(original, img)


def _parse_args() -> ResizeRequest:
    p = argparse.ArgumentParser(description="Dynamic-programming seam carving for content-aware image reduction.")
    p.add_argument("--input", required=True, help="Input image path")
    p.add_argument("--output", required=True, help="Output image path")
    p.add_argument("--target-width", type=int, required=True, help="Target width (<= original width)")
    p.add_argument("--target-height", type=int, required=True, help="Target height (<= original height)")
    p.add_argument("--energy", choices=["sobel", "scharr", "luma_grad"], default="sobel", help="Energy function")
    p.add_argument("--protect-mask", default=None, help="Binary mask path: pixels to preserve (white=preserve)")
    p.add_argument("--remove-mask", default=None, help="Binary mask path: pixels to prefer removal (white=remove)")
    p.add_argument("--viz-dir", default=None, help="Directory to save energy/cost/seam overlays")
    p.add_argument("--viz-every", type=int, default=1, help="Save visualization every N seam removals")
    args = p.parse_args()

    return ResizeRequest(
        input_path=args.input,
        output_path=args.output,
        target_width=args.target_width,
        target_height=args.target_height,
        energy_method=args.energy,
        protect_mask_path=args.protect_mask,
        remove_mask_path=args.remove_mask,
        visualize_dir=args.viz_dir,
        visualize_every=args.viz_every,
    )


def main() -> None:
    req = _parse_args()
    metrics = seam_carve_resize(req)
    for k in sorted(metrics.keys()):
        print(f"{k}: {metrics[k]:.6f}")


if __name__ == "__main__":
    main()