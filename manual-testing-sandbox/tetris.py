import pygame

# Step 1: Install and verify pygame installation (Run 'pip install pygame' in your terminal before executing this script)
try:
    # Verify pygame installation
    pygame.init()
    print("Pygame installed and initialized successfully!")
except Exception as e:
    print(f"Error initializing pygame: {e}")

# Step 2: Create a game window
# Initialize dimensions
width = 400
height = 600

# Create the game window with specified dimensions
window = pygame.display.set_mode((width, height))
pygame.display.set_caption("俄罗斯方块")

# Step 4: Define colors for tetromino shapes
colors = [
    (255, 0, 0),    # Red for T-shaped tetromino
    (0, 255, 0),    # Green for Square-shaped tetromino
    (0, 0, 255),    # Blue for L-shaped tetromino
    (255, 255, 0),  # Yellow for J-shaped tetromino
    (0, 255, 255),  # Cyan for S-shaped tetromino
    (255, 0, 255),  # Magenta for Z-shaped tetromino
    (128, 128, 128),# Gray for I-shaped tetromino
    (255, 165, 0)   # Orange for 凹字形 tetromino
]

# Step 3: Define tetromino shapes
shapes = [
    [[1, 1, 1],
     [0, 1, 0]],  # T-shaped tetromino
    [[1, 1],
     [1, 1]],      # Square-shaped tetromino
    [[1, 0, 0],
     [1, 1, 1]],   # L-shaped tetromino
    [[0, 0, 1],
     [1, 1, 1]],   # J-shaped tetromino
    [[0, 1, 1],
     [1, 1, 0]],   # S-shaped tetromino
    [[1, 1, 0],
     [0, 1, 1]],   # Z-shaped tetromino
    [[1, 1, 1, 1]], # I-shaped tetromino
    [[1, 1, 1],
     [1, 0, 1]]    # 凹字形 tetromino
]

# Step 5: Define grid and boundaries
# Initialize grid dimensions based on the window dimensions
rows = 20
cols = 10
block_size = width // cols

# Create a grid represented by a 2D array
grid = [[0 for _ in range(cols)] for _ in range(rows)]

def is_within_boundary(shape, x, y):
    """
    Function to check if a given tetromino shape stays within the grid boundary

    Args:
        shape: The 2D array representing the tetromino shape
        x: The top-left x-coordinate of the shape on the grid
        y: The top-left y-coordinate of the shape on the grid

    Returns:
        bool: True if the shape is within boundaries, False otherwise
    """
    for i, row in enumerate(shape):
        for j, cell in enumerate(row):
            if cell:  # Check non-zero parts of the shape
                # Check if out of horizontal or vertical bounds
                if x + j < 0 or x + j >= cols or y + i >= rows:
                    return False
    return True

# Step 6: Implement tetromino falling logic
pygame.time.set_timer(pygame.USEREVENT + 1, 1000)  # Set a timer for tetromino downward movement
current_piece = {'shape': shapes[0], 'x': cols // 2, 'y': 0}  # Initialize a test tetromino

def move_down():
    """
    Move the current tetromino down by one row
    """
    current_piece['y'] += 1
    if not is_within_boundary(current_piece['shape'], current_piece['x'], current_piece['y']):
        current_piece['y'] -= 1  # Revert if out of boundary

# Step 7: Implement left and right movement logic
def move_horizontal(direction):
    """
    Move the current tetromino left or right based on user input

    Args:
        direction: 'left' or 'right'
    """
    if direction == 'left':
        current_piece['x'] -= 1
        if not is_within_boundary(current_piece['shape'], current_piece['x'], current_piece['y']):
            current_piece['x'] += 1  # Revert if out of boundary
    elif direction == 'right':
        current_piece['x'] += 1
        if not is_within_boundary(current_piece['shape'], current_piece['x'], current_piece['y']):
            current_piece['x'] -= 1  # Revert if out of boundary

# Step 8: Implement tetromino rotation logic
def rotate_piece():
    """
    Rotate the current tetromino clockwise and revert if out of boundary or collision
    """
    rotated_shape = list(zip(*current_piece['shape'][::-1]))  # Rotate clockwise
    if is_within_boundary(rotated_shape, current_piece['x'], current_piece['y']):
        current_piece['shape'] = rotated_shape

# Game loop
running = True
while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.USEREVENT + 1:  # Timer event for downward movement
            move_down()
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_LEFT:
                move_horizontal('left')
            elif event.key == pygame.K_RIGHT:
                move_horizontal('right')
            elif event.key == pygame.K_UP:
                rotate_piece()

pygame.quit()