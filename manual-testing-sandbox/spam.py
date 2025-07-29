import pandas as pd

# Step 1: Load the dataset from 'src/spam.csv'
dataset = pd.read_csv('src/spam.csv')

# Display basic structure of the dataset
print(f'Dataset Shape: {dataset.shape}')  # Show number of rows and columns
print(f'Column Names: {dataset.columns.tolist()}')  # Show column names
print(f'Data Types:\n{dataset.dtypes}')  # Show data types of each column

# Step 2: Clean the dataset
# Check for missing values and abnormal entries
missing_values = dataset.isnull().sum()
abnormal_entries = (dataset.eq('').sum()) | (dataset.isin(['?', 'N/A']).sum())  # Check for values that may not be valid

# Handle missing or abnormal values (for simplicity, remove rows with such values)
if missing_values.sum() > 0 or abnormal_entries.sum() > 0:
    dataset = dataset.dropna()  # Drop rows with missing values
    dataset = dataset[~dataset.isin(['', '?', 'N/A']).any(axis=1)]  # Remove rows with abnormal entries

# Display cleaned dataset information
print(f'Dataset Shape After Cleaning: {dataset.shape}')  # Show updated number of rows and columns
print(f'Missing Values After Cleaning: {dataset.isnull().sum().sum()}')
