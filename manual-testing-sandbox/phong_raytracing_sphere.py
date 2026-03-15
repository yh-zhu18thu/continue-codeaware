import numpy as np
from PIL import Image

# 场景参数
RES_X, RES_Y = 400, 400  # 画布分辨率
WIDTH, HEIGHT = RES_X, RES_Y

# 相机设置
CAMERA_POS = np.array([0.0, 0.0, 1.0])  # 相机位置
LOOK_AT = np.array([0.0, 0.0, 0.0])      # 相机目标点
UP = np.array([0.0, 1.0, 0.0])
FOV = np.radians(60)

# 球体设置
SPHERE_CENTER = np.array([0.0, 0.0, -3.0])
SPHERE_RADIUS = 1.0
SPHERE_COLOR = np.array([100, 149, 237]) / 255.0  # 天蓝色

# 光源设置
LIGHT_POS = np.array([5.0, 5.0, 0.0])
LIGHT_COLOR = np.array([1.0, 1.0, 1.0])

# 材质参数（Phong模型）
AMBIENT_COEFF = 0.1
DIFFUSE_COEFF = 0.7
SPECULAR_COEFF = 0.2
SPECULAR_EXP = 32

BACKGROUND_COLOR = np.array([0.1, 0.1, 0.1])


def normalize(v):
    norm = np.linalg.norm(v)
    if norm == 0:
        return v
    return v / norm


def get_camera_basis():
    """
    计算相机的局部坐标轴（右、上、前）
    """
    f = normalize(LOOK_AT - CAMERA_POS)
    r = normalize(np.cross(f, UP))
    u = np.cross(r, f)
    return r, u, -f


def ray_sphere_intersect(origin, direction, center, radius):
    """
    解射线与球的交点
    返回最近的t（若无交点返回None和None）
    """
    L = origin - center
    a = np.dot(direction, direction)
    b = 2.0 * np.dot(direction, L)
    c = np.dot(L, L) - radius * radius
    discriminant = b * b - 4 * a * c
    if discriminant < 0:
        return None, None
    sqrt_disc = np.sqrt(discriminant)
    t1 = (-b - sqrt_disc) / (2 * a)
    t2 = (-b + sqrt_disc) / (2 * a)
    t = min(t1, t2)
    if t < 1e-4:
        t = max(t1, t2)
    if t < 1e-4:
        return None, None
    hit_point = origin + t * direction
    normal = normalize(hit_point - center)
    return hit_point, normal


def phong_shading(hit_point, normal, view_dir, light_pos, light_color, object_color):
    # 环境光
    ambient = AMBIENT_COEFF * object_color
    # 光照方向
    light_dir = normalize(light_pos - hit_point)
    # 漫反射
    diff = max(np.dot(normal, light_dir), 0.0)
    diffuse = DIFFUSE_COEFF * diff * object_color
    # 镜面反射
    reflect_dir = normalize(2 * np.dot(normal, light_dir) * normal - light_dir)
    spec = max(np.dot(reflect_dir, view_dir), 0.0)
    specular = SPECULAR_COEFF * (spec ** SPECULAR_EXP) * light_color
    color = ambient + diffuse + specular
    color = np.clip(color, 0, 1)
    return color


def render():
    img = np.zeros((HEIGHT, WIDTH, 3), dtype=np.float32)
    aspect_ratio = WIDTH / HEIGHT
    screen_height = 2 * np.tan(FOV / 2)
    screen_width = screen_height * aspect_ratio
    r, u, f = get_camera_basis()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            # 归一化像素坐标到[-1,1]
            px = (x + 0.5) / WIDTH * 2 - 1
            py = 1 - (y + 0.5) / HEIGHT * 2
            px *= screen_width / 2
            py *= screen_height / 2
            direction = normalize(px * r + py * u + f)
            hit_point, normal = ray_sphere_intersect(CAMERA_POS, direction, SPHERE_CENTER, SPHERE_RADIUS)
            if hit_point is not None:
                view_dir = normalize(CAMERA_POS - hit_point)
                color = phong_shading(
                    hit_point, normal, view_dir,
                    LIGHT_POS, LIGHT_COLOR, SPHERE_COLOR
                )
                img[y, x] = color
            else:
                img[y, x] = BACKGROUND_COLOR
    return img


def main():
    img = render()
    img_uint8 = (img * 255).astype(np.uint8)
    image = Image.fromarray(img_uint8, 'RGB')
    image.save('phong_raytracing_result.png')

if __name__ == '__main__':
    main()
