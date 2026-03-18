import numpy as np
from PIL import Image

# Step 1: Define camera and viewport parameters
def setup_camera(width, height):
    camera_origin = np.array([0.0, 0.0, 1.0])  # Camera position
    look_at = np.array([0.0, 0.0, 0.0])       # Look at point
    up = np.array([0.0, 1.0, 0.0])

    viewport_height = 2.0
    viewport_width = (width / height) * viewport_height
    focal_length = 1.0

    w = (camera_origin - look_at)
    w = w / np.linalg.norm(w)
    u = np.cross(up, w)
    u = u / np.linalg.norm(u)
    v = np.cross(w, u)

    viewport_center = camera_origin - w * focal_length
    horizontal = u * viewport_width
    vertical = v * viewport_height
    lower_left = viewport_center - horizontal / 2 - vertical / 2
    return {
        'origin': camera_origin,
        'lower_left': lower_left,
        'horizontal': horizontal,
        'vertical': vertical,
        'width': width,
        'height': height
    }

# Step 2: Set sphere and light properties
class Sphere:
    def __init__(self, center, radius, color, ka, kd, ks, shininess):
        self.center = np.array(center, dtype=np.float32)
        self.radius = radius
        self.color = np.array(color, dtype=np.float32)  # base color
        self.ka = ka  # ambient coefficient
        self.kd = kd  # diffuse coefficient
        self.ks = ks  # specular coefficient
        self.shininess = shininess

class Light:
    def __init__(self, position, color):
        self.position = np.array(position, dtype=np.float32)
        self.color = np.array(color, dtype=np.float32)

# Step 4: Ray-sphere intersection
def ray_sphere_intersect(origin, direction, sphere):
    oc = origin - sphere.center
    a = np.dot(direction, direction)
    b = 2.0 * np.dot(oc, direction)
    c = np.dot(oc, oc) - sphere.radius * sphere.radius
    discriminant = b * b - 4 * a * c
    if discriminant < 0:
        return None
    t1 = (-b - np.sqrt(discriminant)) / (2 * a)
    t2 = (-b + np.sqrt(discriminant)) / (2 * a)
    t = None
    if t1 > 1e-4 and (t1 < t2 or t2 < 1e-4):
        t = t1
    elif t2 > 1e-4:
        t = t2
    if t is not None:
        point = origin + t * direction
        return point, t
    return None

# Step 5/6: Phong shading model
def compute_color(point, normal, view_dir, sphere, lights, ambient_light):
    ka, kd, ks = sphere.ka, sphere.kd, sphere.ks
    sphere_color = sphere.color
    color = ka * ambient_light * sphere_color  # ambient
    for light in lights:
        light_dir = light.position - point
        light_dir = light_dir / np.linalg.norm(light_dir)
        # Shadow check would be here if multiple objects
        # Diffuse
        diff = max(np.dot(normal, light_dir), 0.0)
        diffuse = kd * diff * light.color * sphere_color
        # Specular
        reflect_dir = 2 * np.dot(normal, light_dir) * normal - light_dir
        reflect_dir = reflect_dir / np.linalg.norm(reflect_dir)
        spec = max(np.dot(reflect_dir, view_dir), 0.0) ** sphere.shininess
        specular = ks * spec * light.color
        color += diffuse + specular
    return np.clip(color, 0, 1)

def render(width, height):
    camera = setup_camera(width, height)
    sphere = Sphere(center=[0, 0, -2], radius=0.8, color=[0.3, 0.6, 1.0],
                   ka=0.2, kd=0.7, ks=0.5, shininess=32)
    lights = [
        Light(position=[2, 4, 0], color=[1.0, 1.0, 1.0])
    ]
    ambient_light = 0.2
    image = np.zeros((height, width, 3), dtype=np.float32)

    # Step 3: For each pixel, cast ray
    for y in range(height):
        for x in range(width):
            u = x / (width - 1)
            v = 1.0 - y / (height - 1)
            pixel = (camera['lower_left'] + u * camera['horizontal'] + v * camera['vertical'])
            ray_origin = camera['origin']
            direction = pixel - ray_origin
            direction = direction / np.linalg.norm(direction)
            res = ray_sphere_intersect(ray_origin, direction, sphere)
            if res is not None:
                point, _ = res
                # Step 5: Compute normal and view dir
                normal = point - sphere.center
                normal = normal / np.linalg.norm(normal)
                view_dir = ray_origin - point
                view_dir = view_dir / np.linalg.norm(view_dir)
                # Step 6: Phong shading
                color = compute_color(point, normal, view_dir, sphere, lights, ambient_light)
                image[y, x] = color
            else:
                image[y, x] = np.array([0,0,0], dtype=np.float32)
    # Step 8: Save image
    img_arr = np.clip(image * 255, 0, 255).astype(np.uint8)
    img = Image.fromarray(img_arr, mode='RGB')
    img.save('phong_sphere.png')
    print('Rendered to phong_sphere.png')

if __name__ == '__main__':
    render(512, 512)
