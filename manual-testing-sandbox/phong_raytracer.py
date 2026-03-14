import numpy as np
from PIL import Image

# 1. 定义摄像机和视图参数
WIDTH = 400
HEIGHT = 300
FOV = np.pi / 3  # 60 degrees field of view
CAMERA_POS = np.array([0.0, 0.0, -1.0])
LOOK_AT = np.array([0.0, 0.0, 0.0])
UP = np.array([0.0, 1.0, 0.0])

# 2. 建立球体几何体信息
class Sphere:
    def __init__(self, center, radius, color, specular=50, reflective=0.5):
        self.center = np.array(center)
        self.radius = radius
        self.color = np.array(color)
        self.specular = specular
        self.reflective = reflective

sphere = Sphere(center=[0, 0, 3], radius=1, color=[200, 60, 60], specular=100, reflective=0.2)
objects = [sphere]

# 3. 配置光源及其属性
class Light:
    def __init__(self, position, color, intensity=1.0):
        self.position = np.array(position)
        self.color = np.array(color)
        self.intensity = intensity

light = Light(position=[5, 5, -2], color=[255, 255, 255], intensity=1.2)
ambient_light = np.array([35, 35, 35]) # 环境光分量

# 4. 生成像素对应的视线射线

def normalize(v):
    norm = np.linalg.norm(v)
    if norm == 0:
        return v
    return v / norm

def get_ray_direction(x, y):
    aspect_ratio = WIDTH / HEIGHT
    Px = (2 * ((x + 0.5) / WIDTH) - 1) * np.tan(FOV/2) * aspect_ratio
    Py = (1 - 2 * ((y + 0.5) / HEIGHT)) * np.tan(FOV/2)
    # 摄像机默认朝向z轴正方向
    direction = np.array([Px, Py, 1])
    return normalize(direction)

# 5. 检测射线与球体的交点
def ray_sphere_intersect(origin, direction, sphere):
    CO = origin - sphere.center
    a = np.dot(direction, direction)
    b = 2 * np.dot(CO, direction)
    c = np.dot(CO, CO) - sphere.radius ** 2
    discriminant = b*b - 4*a*c
    if discriminant < 0:
        return None
    sqrt_disc = np.sqrt(discriminant)
    t1 = (-b - sqrt_disc) / (2*a)
    t2 = (-b + sqrt_disc) / (2*a)
    if t1 > 0.001:
        return t1
    if t2 > 0.001:
        return t2
    return None

# 6. 处理无交点像素的背景色
BACKGROUND_COLOR = np.array([30, 144, 255]) # 深天蓝

# 7. 计算表面法向量
def get_normal(point, sphere):
    return normalize(point - sphere.center)

# 8. 应用Phong模型计算光照

def compute_lighting(point, normal, view_dir, sphere, objects, light, ambient):
    # 环境光
    color = ambient.astype(np.float32)
    # 检查阴影遮挡：9. 考虑阴影遮挡影响
    to_light = normalize(light.position - point)
    shadow_orig = point + 0.001 * normal
    shadow = False
    for obj in objects:
        t = ray_sphere_intersect(shadow_orig, to_light, obj)
        if obj != sphere and t is not None:
            shadow = True
            break
        # 对于当前球体，如果t>0.001说明前方有遮挡
        if obj == sphere and t is not None and t > 0.001:
            shadow = True
            break
    if not shadow:
        # 漫反射
        diff = max(0, np.dot(normal, to_light))
        color += sphere.color * diff * light.intensity / 255
        # 镜面反射
        reflect_dir = normalize(2 * np.dot(normal, to_light) * normal - to_light)
        spec = max(0, np.dot(view_dir, reflect_dir)) ** sphere.specular
        color += light.color * spec * light.intensity / 255
    # 保证颜色范围合法
    color = np.clip(color, 0, 255)
    return color.astype(np.uint8)

# 10. 合成最终渲染图像数据
image = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)

for y in range(HEIGHT):
    for x in range(WIDTH):
        # 4. 生成像素对应的视线射线
        ray_origin = CAMERA_POS
        ray_direction = get_ray_direction(x, y)

        # 5. 检测射线与球体的交点
        nearest_t = np.inf
        nearest_obj = None
        for obj in objects:
            t = ray_sphere_intersect(ray_origin, ray_direction, obj)
            if t is not None and t < nearest_t:
                nearest_t = t
                nearest_obj = obj
        if nearest_obj is None:
            # 6. 处理无交点像素的背景色
            image[y, x] = BACKGROUND_COLOR
        else:
            # 交点
            hit_point = ray_origin + nearest_t * ray_direction
            # 7. 计算表面法向量
            normal = get_normal(hit_point, nearest_obj)
            # 8, 9. 应用Phong模型计算光照 + 阴影
            view_dir = normalize(CAMERA_POS - hit_point)
            color = compute_lighting(hit_point, normal, view_dir, nearest_obj, objects, light, ambient_light)
            image[y, x] = color

# 11. 以标准图像格式输出结果
img = Image.fromarray(image, 'RGB')
img.save('phong_sphere.png')
print('渲染完成: phong_sphere.png')
