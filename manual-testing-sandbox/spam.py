import pandas as pd

# Step 1: Load the data from the CSV file located at 'src/spam.csv'
data_path = 'src/spam.csv'  # Path to the data file
try:
    data = pd.read_csv(data_path)  # Reading the CSV file
    print("Data successfully loaded.")
except FileNotFoundError:
    print(f"Error: File not found at {data_path}")
    data = None

# Check if the data is loaded and inspect the first few rows
if data is not None:
    print("Preview of the dataset:")
    print(data.head())  # Display the first 5 rows of the dataset to ensure correctness

    # Additional integrity checks
    print("Dataset summary:")
    print(data.info())  # Summary of the data to check for missing values or types issues
    print("Checking for null values:")
    print(data.isnull().sum())  # Count of null values in each column