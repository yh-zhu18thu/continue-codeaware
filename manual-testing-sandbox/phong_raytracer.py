import numpy as np
from PIL import Image

# 定义球体和光源属性
class Material:
    def __init__(self, ambient, diffuse, specular, shininess):
        self.ambient = np.array(ambient)
        self.diffuse = np.array(diffuse)
        self.specular = np.array(specular)
        self.shininess = shininess

class Sphere:
    def __init__(self, center, radius, material):
        self.center = np.array(center, dtype=np.float32)
        self.radius = radius
        self.material = material

def normalize(v):
    norm = np.linalg.norm(v)
    if norm == 0:
        return v
    return v / norm

# 设置场景
WIDTH, HEIGHT = 512, 512
BACKGROUND_COLOR = np.array([0, 0, 0], dtype=np.float32)

sphere_material = Material(
    ambient=[0.1, 0.1, 0.1],
    diffuse=[0.7, 0.0, 0.0],
    specular=[1.0, 1.0, 1.0],
    shininess=32
)
sphere = Sphere(center=[0, 0, -5], radius=1.0, material=sphere_material)

light_pos = np.array([5, 5, -3], dtype=np.float32)
light_color = np.array([1.0, 1.0, 1.0], dtype=np.float32)
ambient_light = np.array([0.2, 0.2, 0.2], dtype=np.float32)

# 设置虚拟相机与视平面（右手坐标系，z轴指向前方）
camera_pos = np.array([0, 0, 0], dtype=np.float32)
fov = 60  # degree
aspect_ratio = WIDTH / HEIGHT
image_plane_z = -1

# 为每个像素计算视线方向
def get_ray_dir(x, y):
    px = (2 * (x + 0.5) / WIDTH - 1) * np.tan(np.radians(fov) / 2) * aspect_ratio
    py = (1 - 2 * (y + 0.5) / HEIGHT) * np.tan(np.radians(fov) / 2)
    ray_dir = np.array([px, py, image_plane_z])
    return normalize(ray_dir)

# 计算光线与球体的交点
def ray_sphere_intersect(orig, dir, sphere):
    oc = orig - sphere.center
    a = np.dot(dir, dir)
    b = 2.0 * np.dot(dir, oc)
    c = np.dot(oc, oc) - sphere.radius ** 2
    discriminant = b ** 2 - 4 * a * c
    if discriminant < 0:
        return None
    sqrt_disc = np.sqrt(discriminant)
    t1 = (-b - sqrt_disc) / (2 * a)
    t2 = (-b + sqrt_disc) / (2 * a)
    if t1 >= 1e-4:
        return t1
    elif t2 >= 1e-4:
        return t2
    return None

# 计算Phong光照
def compute_phong(point, normal, view_dir, light_pos, light_color, material, shadow):
    color = np.zeros(3)
    # 环境光
    color += material.ambient * ambient_light
    if shadow:
        return np.clip(color, 0, 1)
    # 漫反射
    light_dir = normalize(light_pos - point)
    diff = max(np.dot(normal, light_dir), 0.0)
    color += material.diffuse * light_color * diff
    # 镜面反射
    reflect_dir = normalize(2 * np.dot(normal, light_dir) * normal - light_dir)
    spec = max(np.dot(view_dir, reflect_dir), 0.0) ** material.shininess
    color += material.specular * light_color * spec
    return np.clip(color, 0, 1)

# 阴影测试：判定点到光源直线路径上有无球体遮挡
def is_in_shadow(point, light_pos, sphere):
    shadow_orig = point + 1e-4 * normalize(light_pos - point)
    shadow_dir = normalize(light_pos - shadow_orig)
    max_dist = np.linalg.norm(light_pos - shadow_orig)
    t = ray_sphere_intersect(shadow_orig, shadow_dir, sphere)
    if t is None:
        return False
    if t > 1e-4 and t < max_dist:
        return True
    return False

def render():
    img = np.zeros((HEIGHT, WIDTH, 3), dtype=np.float32)
    for y in range(HEIGHT):
        for x in range(WIDTH):
            ray_dir = get_ray_dir(x, y)
            t = ray_sphere_intersect(camera_pos, ray_dir, sphere)
            if t is not None:
                # 得到交点
                point = camera_pos + t * ray_dir
                # 得到法线
                normal = normalize(point - sphere.center)
                # 计算Phong分量，考虑阴影
                view_dir = normalize(camera_pos - point)
                shadow = is_in_shadow(point, light_pos, sphere)
                color = compute_phong(point, normal, view_dir, light_pos, light_color, sphere.material, shadow)
                img[y, x] = color
            else:
                img[y, x] = BACKGROUND_COLOR
    return img

def save_img(img, filename):
    arr = np.clip(img * 255, 0, 255).astype(np.uint8)
    im = Image.fromarray(arr, 'RGB')
    im.save(filename)

if __name__ == "__main__":
    image = render()
    save_img(image, "phong_sphere.png")
