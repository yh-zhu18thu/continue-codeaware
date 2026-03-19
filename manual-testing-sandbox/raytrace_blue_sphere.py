import numpy as np
import matplotlib.pyplot as plt


def render_blue_sphere(
    width: int = 640,
    height: int = 480,
    fov_degrees: float = 60.0,
    camera_pos: np.ndarray | None = None,
    look_at: np.ndarray | None = None,
    up: np.ndarray | None = None,
    sphere_center: np.ndarray | None = None,
    sphere_radius: float = 1.0,
    sphere_color: np.ndarray | None = None,
    light_pos: np.ndarray | None = None,
    light_intensity: float = 1.2,
    ambient: float = 0.12,
    background_top: np.ndarray | None = None,
    background_bottom: np.ndarray | None = None,
) -> np.ndarray:
    # 1. 定义相机与画布
    if camera_pos is None:
        camera_pos = np.array([0.0, 0.0, 3.0], dtype=np.float32)
    if look_at is None:
        look_at = np.array([0.0, 0.0, 0.0], dtype=np.float32)
    if up is None:
        up = np.array([0.0, 1.0, 0.0], dtype=np.float32)

    aspect = width / height
    fov = np.deg2rad(fov_degrees)
    half_height = np.tan(fov / 2.0)
    half_width = aspect * half_height

    # 相机坐标系
    forward = look_at - camera_pos
    forward = forward / (np.linalg.norm(forward) + 1e-12)
    right = np.cross(forward, up)
    right = right / (np.linalg.norm(right) + 1e-12)
    true_up = np.cross(right, forward)
    true_up = true_up / (np.linalg.norm(true_up) + 1e-12)

    # 2. 生成像素对应光线
    xs = (np.arange(width, dtype=np.float32) + 0.5) / width
    ys = (np.arange(height, dtype=np.float32) + 0.5) / height
    px = (2.0 * xs - 1.0) * half_width
    py = (1.0 - 2.0 * ys) * half_height
    PX, PY = np.meshgrid(px, py)  # (H, W)

    dirs = (
        forward[None, None, :]
        + PX[:, :, None] * right[None, None, :]
        + PY[:, :, None] * true_up[None, None, :]
    )
    dirs = dirs / (np.linalg.norm(dirs, axis=2, keepdims=True) + 1e-12)  # (H, W, 3)
    origins = np.broadcast_to(camera_pos[None, None, :], dirs.shape).astype(np.float32)

    # 3. 建立球体与光源参数
    if sphere_center is None:
        sphere_center = np.array([0.0, 0.0, 0.0], dtype=np.float32)
    if sphere_color is None:
        sphere_color = np.array([0.1, 0.25, 1.0], dtype=np.float32)  # 蓝色
    if light_pos is None:
        light_pos = np.array([2.2, 2.0, 3.0], dtype=np.float32)
    if background_top is None:
        background_top = np.array([0.08, 0.08, 0.10], dtype=np.float32)
    if background_bottom is None:
        background_bottom = np.array([0.02, 0.02, 0.03], dtype=np.float32)

    # 4. 计算射线与球体相交
    oc = origins - sphere_center[None, None, :]
    a = np.sum(dirs * dirs, axis=2)  # 约等于 1
    b = 2.0 * np.sum(oc * dirs, axis=2)
    c = np.sum(oc * oc, axis=2) - sphere_radius * sphere_radius
    discriminant = b * b - 4.0 * a * c

    # 5. 选择最近可见交点
    hit = discriminant >= 0.0
    sqrt_disc = np.sqrt(np.clip(discriminant, 0.0, None))
    t0 = (-b - sqrt_disc) / (2.0 * a)
    t1 = (-b + sqrt_disc) / (2.0 * a)

    eps = 1e-4
    t0_valid = (t0 > eps) & hit
    t1_valid = (t1 > eps) & hit

    t = np.full((height, width), np.inf, dtype=np.float32)
    t = np.where(t0_valid, t0.astype(np.float32), t)
    t = np.where((~t0_valid) & t1_valid, t1.astype(np.float32), t)
    hit = np.isfinite(t)

    # 6. 计算交点法线方向
    p = origins + dirs * t[:, :, None]  # (H, W, 3)
    n = p - sphere_center[None, None, :]
    n = n / (np.linalg.norm(n, axis=2, keepdims=True) + 1e-12)

    # 7. 实现漫反射蓝色着色
    l = light_pos[None, None, :] - p
    l = l / (np.linalg.norm(l, axis=2, keepdims=True) + 1e-12)
    diffuse = np.maximum(0.0, np.sum(n * l, axis=2)) * float(light_intensity)

    # 8. 加入环境光与背景色
    shade = np.clip(ambient + diffuse, 0.0, 1.0)
    sphere_rgb = shade[:, :, None] * sphere_color[None, None, :]

    # 背景渐变（按 y 插值）
    tbg = (np.arange(height, dtype=np.float32) / max(1, height - 1))[:, None]
    bg = (1.0 - tbg)[:, :, None] * background_top[None, None, :] + tbg[:, :, None] * background_bottom[None, None, :]

    # 9. 用numpy向量化整图计算
    img = np.where(hit[:, :, None], sphere_rgb, bg).astype(np.float32)

    # 10. 输出并保存渲染结果（数组在这里返回；显示与保存在 main 中执行）
    return img


def main() -> None:
    img = render_blue_sphere(width=800, height=600)
    img8 = (np.clip(img, 0.0, 1.0) * 255.0).astype(np.uint8)

    plt.figure(figsize=(8, 6))
    plt.imshow(img8)
    plt.axis("off")
    plt.tight_layout(pad=0)
    plt.savefig("blue_sphere.png", dpi=150, bbox_inches="tight", pad_inches=0)
    plt.show()


if __name__ == "__main__":
    main()