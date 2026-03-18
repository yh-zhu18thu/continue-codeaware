import numpy as np
from PIL import Image

# 1. 定义球体几何参数
class Sphere:
    def __init__(self, center, radius, color, ambient, diffuse, specular, shininess):
        self.center = np.array(center, dtype=np.float32)
        self.radius = radius
        self.color = np.array(color, dtype=np.float32)  # Base color
        self.ambient = np.array(ambient, dtype=np.float32)
        self.diffuse = np.array(diffuse, dtype=np.float32)
        self.specular = np.array(specular, dtype=np.float32)
        self.shininess = shininess

    def intersect(self, ray_origin, ray_dir):
        # Returns (t, point, normal) or (None, None, None) if no intersection
        oc = ray_origin - self.center
        a = np.dot(ray_dir, ray_dir)
        b = 2.0 * np.dot(oc, ray_dir)
        c = np.dot(oc, oc) - self.radius * self.radius
        discriminant = b * b - 4 * a * c
        if discriminant < 0:
            return None, None, None
        sqrt_disc = np.sqrt(discriminant)
        t1 = (-b - sqrt_disc) / (2 * a)
        t2 = (-b + sqrt_disc) / (2 * a)
        t = None
        if t1 > 1e-4:
            t = t1
        elif t2 > 1e-4:
            t = t2
        if t is None:
            return None, None, None
        point = ray_origin + t * ray_dir
        normal = (point - self.center) / self.radius
        return t, point, normal

# 2. 设置光源属性
class Light:
    def __init__(self, position, color, intensity):
        self.position = np.array(position, dtype=np.float32)
        self.color = np.array(color, dtype=np.float32)
        self.intensity = intensity

# 3. 构建摄像机与视平面
class Camera:
    def __init__(self, lookfrom, lookat, up, fov, width, height):
        self.position = np.array(lookfrom, dtype=np.float32)
        self.lookat = np.array(lookat, dtype=np.float32)
        self.up = np.array(up, dtype=np.float32)
        self.fov = fov
        self.width = width
        self.height = height
        self._setup()

    def _setup(self):
        w = self.position - self.lookat
        w = w / np.linalg.norm(w)
        u = np.cross(self.up, w)
        u = u / np.linalg.norm(u)
        v = np.cross(w, u)
        self.u = u
        self.v = v
        self.w = w
        aspect = self.width / self.height
        self.screen_height = 2 * np.tan(np.radians(self.fov) / 2)
        self.screen_width = aspect * self.screen_height

    def get_ray(self, x, y):
        # x, y in [0, width-1], [0, height-1]
        px = (x + 0.5) / self.width - 0.5
        py = 0.5 - (y + 0.5) / self.height
        dir = -self.w + self.u * px * self.screen_width + self.v * py * self.screen_height
        dir = dir / np.linalg.norm(dir)
        return self.position, dir

# 12 steps - main raytracing

def clamp01(x):
    return np.clip(x, 0, 1)

def render(width, height):
    # Scene
    sphere = Sphere(
        center=[0, 0, -3],
        radius=1.0,
        color=[0.6, 0.9, 0.2],  # base (diffuse) color
        ambient=[0.1, 0.1, 0.1],
        diffuse=[0.7, 0.7, 0.7],
        specular=[1.0, 1.0, 1.0],
        shininess=32
    )
    # 2. 光源参数
    light = Light(
        position=[2.5, 1.5, -1],
        color=[1.0, 1.0, 1.0],
        intensity=2.0
    )
    # 3. 摄像机参数
    cam = Camera(
        lookfrom=[0, 0, 1],
        lookat=[0, 0, -3],
        up=[0, 1, 0],
        fov=45,
        width=width,
        height=height
    )
    # 11. 背景色
    bg_color = np.array([0.05, 0.08, 0.13])
    # 7. 环境光分量
    ambient_light = np.array([0.15, 0.15, 0.15])

    img = np.zeros((height, width, 3), dtype=np.float32)
    for y in range(height):
        for x in range(width):
            # 4. 生成像素射线
            ray_origin, ray_dir = cam.get_ray(x, y)

            # 5. 计算射线和球体交点
            t, point, normal = sphere.intersect(ray_origin, ray_dir)
            if t is None:
                # 11. 填充背景色
                img[y, x] = bg_color
                continue
            # 6. 判断阴影遮蔽关系
            to_light = light.position - point
            to_light_dir = to_light / np.linalg.norm(to_light)
            shadow_origin = point + normal * 1e-4
            t_shadow, _, _ = sphere.intersect(shadow_origin, to_light_dir)
            shadow = (t_shadow is not None) and (t_shadow < np.linalg.norm(to_light))
            # 7. 环境光
            ambient = sphere.ambient * ambient_light
            # 8. 漫反射
            diff = 0.0
            if not shadow:
                diff = max(np.dot(normal, to_light_dir), 0.0)
            diffuse = sphere.diffuse * diff * light.intensity * light.color
            # 9. 镜面反射
            spec = 0.0
            if not shadow and diff > 0.0:
                reflect_dir = 2 * np.dot(normal, to_light_dir) * normal - to_light_dir
                view_dir = -ray_dir
                spec = max(np.dot(view_dir, reflect_dir), 0.0) ** sphere.shininess
            specular = sphere.specular * spec * light.intensity * light.color
            # 10. 合成像素颜色
            color = sphere.color * (ambient + diffuse) + specular
            color = clamp01(color)
            img[y, x] = color
    # 12. 保存图片
    to_img = (img * 255).astype(np.uint8)
    Image.fromarray(to_img).save("output.png")

if __name__ == "__main__":
    render(512, 512)
