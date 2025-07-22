import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.svm import SVC
from sklearn.metrics import classification_report

# Load the spam dataset from the specified path
spam_file_path = 'data/spam.csv'
data = pd.read_csv(spam_file_path)

# Check for missing values
missing_values = data.isnull().sum()

# Check for data summary (to identify potential anomalies quickly)
data_summary = data.describe()

# Output to verify data quality
print("Missing Values:\n", missing_values)
print("Data Summary:\n", data_summary)

# Step s-2: Process text data, split dataset, and prepare features and labels
# Extract text features and labels
data['text'] = data['text'].fillna('')  # Handle missing text values by filling with empty strings
vectorizer = CountVectorizer(stop_words='english')  # Initialize vectorizer with stop word removal
X = vectorizer.fit_transform(data['text'])  # Convert text to numerical feature vectors
y = data['label']  # Assume 'label' column is the target variable

# Split into training and testing sets
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)

# Step s-3: Train SVM classifier
# Initialize and train SVM model (using RBF kernel as an example)
svm_model = SVC(kernel='rbf', C=1.0, gamma='scale')
svm_model.fit(X_train, y_train)

# Evaluate the model on the testing set
predictions = svm_model.predict(X_test)
print(classification_report(y_test, predictions))  # Output classification performance metrics