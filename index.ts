type User = {
    name: string;
    age: number;
    city: string;
}

const data: User = {
    name: "John",
    age: 30,
    city: "New York",
}

export function getUser() {
    return data;
}
