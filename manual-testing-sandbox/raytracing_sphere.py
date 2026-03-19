import math
from typing import Tuple
from PIL import Image

# Step 1: 定义三维空间坐标系
class Vec3:
    def __init__(self, x: float, y: float, z: float):
        self.x = x
        self.y = y
        self.z = z

    def __add__(self, other):
        return Vec3(self.x + other.x, self.y + other.y, self.z + other.z)

    def __sub__(self, other):
        return Vec3(self.x - other.x, self.y - other.y, self.z - other.z)

    def __mul__(self, scalar: float):
        return Vec3(self.x * scalar, self.y * scalar, self.z * scalar)

    def __truediv__(self, scalar: float):
        return Vec3(self.x / scalar, self.y / scalar, self.z / scalar)

    def dot(self, other) -> float:
        return self.x * other.x + self.y * other.y + self.z * other.z

    def length(self) -> float:
        return math.sqrt(self.x**2 + self.y**2 + self.z**2)

    def normalize(self):
        l = self.length()
        if l == 0:
            return Vec3(0, 0, 0)
        return self / l

    def to_tuple(self):
        return (self.x, self.y, self.z)

# Step 2: 设置球体和摄像机参数
class Sphere:
    def __init__(self, center: Vec3, radius: float, color: Tuple[int, int, int]):
        self.center = center
        self.radius = radius
        self.color = color

class Ray:
    def __init__(self, origin: Vec3, direction: Vec3):
        self.origin = origin
        self.direction = direction.normalize()

# Step 3: 生成视线穿过像素的光线

def render_scene(width=400, height=300) -> Image:
    # Step 2: 摄像机和球体
    camera_pos = Vec3(0, 0, -1)  # 摄像机在z轴负方向
    sphere = Sphere(Vec3(0, 0, 2), 1, (255, 0, 0))
    light_dir = Vec3(-1, -1, -1).normalize() # 光源方向
    bg_color = (30, 30, 60)
    fov = math.pi / 3  # 60度视场

    img = Image.new("RGB", (width, height))
    pixels = img.load()

    aspect_ratio = width / height
    screen_height = 2 * math.tan(fov / 2)
    screen_width = screen_height * aspect_ratio

    for y in range(height):
        for x in range(width):
            # Step 3: 生成像素光线
            px = (x + 0.5) / width * screen_width - screen_width / 2
            py = -(y + 0.5) / height * screen_height + screen_height / 2
            ray_dir = Vec3(px, py, 1).normalize()
            ray = Ray(camera_pos, ray_dir)
            color = cast_ray(ray, sphere, light_dir, bg_color)
            pixels[x, y] = color
    return img

# Step 4: 判断光线与球体的相交关系
# Step 5: 计算表面颜色和亮度

def cast_ray(ray: Ray, sphere: Sphere, light_dir: Vec3, bg_color: Tuple[int, int, int]) -> Tuple[int, int, int]:
    oc = ray.origin - sphere.center
    a = ray.direction.dot(ray.direction)
    b = 2.0 * oc.dot(ray.direction)
    c = oc.dot(oc) - sphere.radius * sphere.radius
    discriminant = b * b - 4 * a * c
    if discriminant < 0:
        return bg_color
    sqrt_disc = math.sqrt(discriminant)
    t1 = (-b - sqrt_disc) / (2 * a)
    t2 = (-b + sqrt_disc) / (2 * a)
    t = t1 if t1 > 0 else t2
    if t < 0:
        return bg_color
    # 交点
    hit_point = ray.origin + ray.direction * t
    normal = (hit_point - sphere.center).normalize()
    diffuse = max(0, normal.dot(-light_dir.normalize()))
    r = min(255, int(sphere.color[0] * diffuse))
    g = min(255, int(sphere.color[1] * diffuse))
    b = min(255, int(sphere.color[2] * diffuse))
    # ambient term
    ambient = 0.15
    r = int(r + sphere.color[0] * ambient)
    g = int(g + sphere.color[1] * ambient)
    b = int(b + sphere.color[2] * ambient)
    return (r, g, b)

if __name__ == "__main__":
    # Step 6: 输出渲染图像
    img = render_scene(400, 300)
    img.save("rendered_sphere.png")
    print("Rendering complete. Saved as rendered_sphere.png")
