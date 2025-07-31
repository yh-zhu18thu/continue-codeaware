import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer

# Step 1: Load the dataset from 'src/spam.csv' with error handling
try:
    dataset = pd.read_csv('src/spam.csv')
    # Display basic structure of the dataset
    print(f'Dataset Shape: {dataset.shape}')  # Show number of rows and columns
    print(f'Column Names: {dataset.columns.tolist()}')  # Show column names
    print(f'Data Types:\n{dataset.dtypes}')  # Show data types of each column
except FileNotFoundError:
    print("Error: The file 'src/spam.csv' was not found. Please ensure the file exists in the correct location.")
except Exception as e:
    print(f"An unexpected error occurred: {e}")
    
# Step 2: Clean the dataset
# Check for missing values and abnormal entries
missing_values = dataset.isnull().sum()
abnormal_entries = (dataset.eq('').sum()) | (dataset.isin(['?', 'N/A']).sum())  # Check for values that may not be valid

def handle_missing_and_abnormal_data(df):
    # Drop rows with excessive missing/abnormal values or fill them
    df = df.dropna()  # Example treatment: dropping rows with missing values
    df.replace(['', '?', 'N/A'], pd.NA, inplace=True)  # Replace abnormal entries with NA
    df.fillna('unknown', inplace=True)  # Fill NA with 'unknown'
    return df

# Apply data handling logic to clean the dataset
dataset = handle_missing_and_abnormal_data(dataset)

# Verify the dataset after cleaning
print("Dataset after cleaning:")
print(dataset.head())